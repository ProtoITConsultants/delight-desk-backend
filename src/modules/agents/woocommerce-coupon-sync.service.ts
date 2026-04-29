import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PromoCodeConfigurationsRepository } from 'src/database/repos/promo-code-configurations.repository';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { UserStoreConnectionsRepository } from 'src/database/repos/user-store-connections.repository';
import {
  WooCommerceCouponPayload,
  WooCommerceRestApiService,
} from '../woocommerce/woocommerce-rest-api.service';
import { PromoCodeConfigurationEntity } from 'src/database/schema';

interface SyncOutcome {
  ok: boolean;
  couponId?: number;
  error?: string;
}

export interface BackfillOutcome {
  imported: number;
  linked: number;
  skipped: number;
  failed: number;
  pagesFetched: number;
  couponsSeen: number;
  pushedExistingDdConfigs: number;
}

/**
 * Result classes for the backfill loop. Kept private to the sync service so the
 * controller / agents.service do not need to know about each individual import path.
 */
type BackfillImportResult =
  | { kind: 'imported'; configId: string }
  | { kind: 'linked'; configId: string }
  | { kind: 'skipped'; reason: string }
  | { kind: 'failed'; error: string };

/**
 * One-way sync: Delight Desk promo code configurations -> WooCommerce coupons.
 *
 * Why one-way: Delight Desk owns extra fields (maxRefundAmount, usageType,
 * appliesToSubscriptions) that have no native WooCommerce equivalent, so promoting
 * Delight Desk as the source of truth keeps the agent's eligibility rules deterministic.
 *
 * Strategy:
 *   - syncOne: best-effort write triggered after each create/update/delete, plus a
 *     silent fallback path that locates a matching coupon by code if the stored id is
 *     stale (eg. user deleted the coupon directly in WooCommerce).
 *   - reconcileEvery15Minutes (cron): retries any rows missing wooCommerceCouponId or
 *     carrying a lastSyncError so transient failures self-heal.
 */
@Injectable()
export class WooCommerceCouponSyncService {
  private readonly logger = new Logger(WooCommerceCouponSyncService.name);

  /**
   * Tracks in-flight backfills so a fast double-toggle of the agent doesn't kick off
   * two simultaneous imports for the same user. Map value is the in-flight Promise so
   * concurrent callers can `await` it and both observe the same outcome.
   */
  private readonly backfillsInFlight = new Map<string, Promise<BackfillOutcome>>();

  /**
   * Recently-pushed sync-loop guard. Every time we PUSH a change to WooCommerce
   * (create/update via syncOne, delete via deleteRemote) we stamp the coupon id with
   * a timestamp. Webhook delivery for that coupon within `RECENTLY_PUSHED_TTL_MS` is
   * dropped because the corresponding event is just our own write echoing back.
   *
   * Memory bounded: entries expire after the TTL and are evicted opportunistically
   * on every read/write so the map never grows beyond the active sync rate.
   */
  private readonly recentlyPushedCache = new Map<number, number>();
  private static readonly RECENTLY_PUSHED_TTL_MS = 60_000;

  constructor(
    private readonly promoCodeConfigsRepo: PromoCodeConfigurationsRepository,
    private readonly storeConnectionsRepo: UserStoreConnectionsRepository,
    private readonly systemSettingsRepo: SystemSettingsRepository,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
  ) {}

  async syncOne(config: PromoCodeConfigurationEntity): Promise<SyncOutcome> {
    if (!(await this.userHasWooCommerceConnection(config.userId))) {
      return { ok: false, error: 'WooCommerce store not connected' };
    }

    const payload = this.buildCouponPayload(config);

    try {
      let couponId = config.wooCommerceCouponId ?? null;

      if (couponId) {
        try {
          const updated = await this.wooCommerceRestApiService.updateCoupon(
            config.userId,
            couponId,
            payload,
          );
          couponId = updated.id;
        } catch (updateError) {
          this.logger.warn(
            `Update for coupon ${couponId} failed (${(updateError as Error).message}); falling back to create/find by code`,
          );
          couponId = null;
        }
      }

      if (!couponId) {
        const existing = await this.wooCommerceRestApiService.findCouponByCode(
          config.userId,
          config.promoCode,
        );
        if (existing?.id) {
          const updated = await this.wooCommerceRestApiService.updateCoupon(
            config.userId,
            existing.id,
            payload,
          );
          couponId = updated.id;
        } else {
          const created = await this.wooCommerceRestApiService.createCoupon(config.userId, payload);
          couponId = created.id;
        }
      }

      await this.promoCodeConfigsRepo.updateSyncMetadata(config.id, {
        wooCommerceCouponId: couponId,
        lastSyncedAt: new Date(),
        lastSyncError: null,
      });

      // Sync-loop guard: stamp this coupon id so the matching webhook delivery
      // (`coupon.created` or `coupon.updated`) is dropped when it echoes back
      // within the TTL.
      if (couponId !== null && couponId !== undefined) {
        this.markCouponRecentlyPushed(couponId);
      }

      return { ok: true, couponId: couponId ?? undefined };
    } catch (error) {
      const message = (error as Error).message ?? 'Unknown error';
      this.logger.error(`Failed to sync promo code ${config.promoCode}: ${message}`);
      await this.promoCodeConfigsRepo.updateSyncMetadata(config.id, {
        lastSyncError: message,
      });
      return { ok: false, error: message };
    }
  }

  async deleteRemote(config: PromoCodeConfigurationEntity): Promise<SyncOutcome> {
    if (!config.wooCommerceCouponId) return { ok: true };
    if (!(await this.userHasWooCommerceConnection(config.userId))) {
      return { ok: false, error: 'WooCommerce store not connected' };
    }
    try {
      // Sync-loop guard: stamp BEFORE the API call so the inbound `coupon.deleted`
      // webhook is recognized as ours even if it arrives faster than the API
      // response (some hosts deliver webhooks within milliseconds).
      this.markCouponRecentlyPushed(config.wooCommerceCouponId);
      await this.wooCommerceRestApiService.deleteCoupon(config.userId, config.wooCommerceCouponId);
      return { ok: true };
    } catch (error) {
      const message = (error as Error).message ?? 'Unknown error';
      this.logger.warn(`Failed to delete remote coupon ${config.wooCommerceCouponId}: ${message}`);
      return { ok: false, error: message };
    }
  }

  /**
   * Sync-loop guard public read API used by the webhook receiver. Returns true
   * when this coupon id was pushed by Delight Desk within the TTL window — the
   * webhook handler should treat the event as a self-echo and skip processing.
   *
   * Eviction of expired entries is performed lazily on each call so the map
   * stays bounded without needing a background timer.
   */
  isCouponRecentlyPushed(wooCouponId: number): boolean {
    this.evictExpiredRecentlyPushedEntries();
    return this.recentlyPushedCache.has(wooCouponId);
  }

  private markCouponRecentlyPushed(wooCouponId: number): void {
    this.recentlyPushedCache.set(wooCouponId, Date.now());
    this.evictExpiredRecentlyPushedEntries();
  }

  private evictExpiredRecentlyPushedEntries(): void {
    const now = Date.now();
    for (const [id, ts] of this.recentlyPushedCache) {
      if (now - ts > WooCommerceCouponSyncService.RECENTLY_PUSHED_TTL_MS) {
        this.recentlyPushedCache.delete(id);
      }
    }
  }

  /**
   * Manual full-resync entry-point exposed via the controller. Iterates every active
   * configuration belonging to userId and pushes them to WooCommerce.
   */
  async syncAllForUser(userId: string): Promise<{ synced: number; failed: number }> {
    const configs = await this.promoCodeConfigsRepo.listByUserId(userId);
    let synced = 0;
    let failed = 0;
    for (const config of configs) {
      const result = await this.syncOne(config);
      if (result.ok) synced++;
      else failed++;
    }
    return { synced, failed };
  }

  /**
   * Periodic reconciliation. Runs every 15 minutes and only retries rows that either
   * never finished syncing (no wooCommerceCouponId) or recorded an error on their last
   * attempt. This keeps the cron cheap and self-limiting in healthy steady state.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcileFailedSyncs(): Promise<void> {
    try {
      const all = await this.promoCodeConfigsRepo.listAll();
      const stale = all.filter((config) => !config.wooCommerceCouponId || !!config.lastSyncError);

      if (!stale.length) return;
      this.logger.log(`Reconciling ${stale.length} promo code configurations with WooCommerce`);

      for (const config of stale) {
        await this.syncOne(config);
      }
    } catch (error) {
      this.logger.error('Coupon reconciliation cron failed', (error as Error).stack);
    }
  }

  private async userHasWooCommerceConnection(userId: string): Promise<boolean> {
    const connection = await this.storeConnectionsRepo.findByPlatform(userId, 'woocommerce');
    return !!connection?.apiKey && !!connection?.apiSecret && !!connection?.storeUrl;
  }

  /**
   * Maps a Delight Desk promo configuration into the WooCommerce coupon shape.
   *
   * - Percentage discounts map to WooCommerce 'percent' coupons (the discountPercentage
   *   field carries the value).
   * - Fixed-amount discounts map to 'fixed_cart' and we use maxRefundAmount as the
   *   coupon amount because Delight Desk does not store a separate fixed value.
   * - usageType=first_time_customer_discount enforces usage_limit_per_user=1 so
   *   WooCommerce blocks repeat redemptions even if the agent's own check is bypassed.
   * - usageType=refund_only marks the coupon as inactive in WooCommerce metadata so
   *   the storefront does not advertise it; the agent still references it for refunds.
   */
  private buildCouponPayload(config: PromoCodeConfigurationEntity): WooCommerceCouponPayload {
    const discountType = config.discountType === 'fixed_amount' ? 'fixed_cart' : 'percent';

    const amount =
      discountType === 'percent'
        ? (this.numericString(config.discountPercentage) ?? '0')
        : (this.numericString(config.maxRefundAmount) ?? '0');

    const enforcedUsageLimitPerUser =
      config.usageType === 'first_time_customer_discount' ||
      config.usageType === 'refund_and_new_customer_offer'
        ? 1
        : null;

    return {
      code: config.promoCode,
      discount_type: discountType,
      amount,
      description: config.description ?? undefined,
      date_expires: config.validUntil ? config.validUntil.toISOString() : null,
      individual_use: true,
      minimum_amount: this.numericString(config.minimumOrderValue) ?? '0',
      // NOTE: We intentionally do NOT send `maximum_amount`. In WooCommerce that field
      // is the maximum cart subtotal at which the coupon is allowed at checkout, which
      // has nothing to do with our `maxRefundAmount` (a Delight Desk-only refund cap
      // enforced by the Promo Code Agent). Sending maxRefundAmount here also breaks
      // WooCommerce's `maximum_amount >= minimum_amount` validation whenever a refund
      // cap is smaller than the minimum order value (e.g. SAVE5: cap $5, min $25).
      usage_limit: config.maxUsageCount ?? null,
      usage_limit_per_user: enforcedUsageLimitPerUser,
      meta_data: [
        { key: '_delightdesk_managed', value: 'true' },
        { key: '_delightdesk_config_id', value: config.id },
        { key: '_delightdesk_usage_type', value: config.usageType },
        {
          key: '_delightdesk_applies_to_subscriptions',
          value: config.appliesToSubscriptions ? 'true' : 'false',
        },
        {
          key: '_delightdesk_active',
          value: config.isActive ? 'true' : 'false',
        },
        // WooCommerce has no native "valid from" / start date for coupons. We store
        // ours in meta so the value round-trips cleanly: when this coupon is later
        // pulled back into Delight Desk the importer reads this marker first and
        // restores the original validFrom. Empty string means "no start date set".
        {
          key: '_delightdesk_valid_from',
          value: config.validFrom ? config.validFrom.toISOString() : '',
        },
      ],
    };
  }

  private numericString(value: string | number | null): string | null {
    if (value === null || value === undefined) return null;
    const asNumber = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(asNumber)) return null;
    return asNumber.toString();
  }

  // =====================================================================================
  // WooCommerce -> Delight Desk backfill (PR 1)
  // =====================================================================================

  /**
   * One-shot WooCommerce -> Delight Desk import that runs in the background when the
   * merchant first enables the Promo Code Agent. After it succeeds we stamp
   * `system_settings.promoCodeAgentInitializedAt` so re-enabling later does NOT re-run
   * the import — ongoing changes are kept in sync by the (PR 2) webhook receivers and
   * the (PR 3) reconciliation cron.
   *
   * Steps:
   *   1. Pull every coupon from WC, page by page, filtering out expired and exhausted
   *      ones so the import is bounded to "active and in-use" coupons even on stores
   *      with thousands of historical codes.
   *   2. For each coupon: skip if Delight Desk already owns it (matched by
   *      `_delightdesk_config_id` meta or by stored `wooCommerceCouponId`); link if a
   *      DD row with the same code already exists; otherwise create a new DD row with
   *      sensible defaults for DD-only fields.
   *   3. Push any pre-existing DD configurations that don't yet have a
   *      `wooCommerceCouponId` so the merchant's WC store and DD agree on the universe
   *      of codes after the backfill completes.
   *
   * Concurrency: a Map keyed by userId dedupes overlapping calls. If a backfill is
   * already running for this user, the second caller awaits the same Promise.
   *
   * Idempotency: `pcAgentInitialized` short-circuits this method, so accidentally
   * calling it twice (or from multiple replicas) is safe.
   */
  async runFullBackfillOnEnable(userId: string): Promise<BackfillOutcome> {
    const inFlight = this.backfillsInFlight.get(userId);
    if (inFlight) {
      this.logger.log(`Backfill already in flight for user ${userId}; awaiting existing run`);
      return inFlight;
    }

    const promise = this.runFullBackfillInternal(userId).finally(() => {
      this.backfillsInFlight.delete(userId);
    });
    this.backfillsInFlight.set(userId, promise);
    return promise;
  }

  private async runFullBackfillInternal(userId: string): Promise<BackfillOutcome> {
    const outcome: BackfillOutcome = {
      imported: 0,
      linked: 0,
      skipped: 0,
      failed: 0,
      pagesFetched: 0,
      couponsSeen: 0,
      pushedExistingDdConfigs: 0,
    };

    if (!(await this.userHasWooCommerceConnection(userId))) {
      this.logger.warn(
        `Cannot run promo code backfill: WooCommerce store not connected for user ${userId}`,
      );
      return outcome;
    }

    const settings = await this.systemSettingsRepo.findByUser(userId);
    if (settings?.promoCodeAgentInitializedAt) {
      this.logger.log(
        `Promo code agent already initialized for user ${userId} at ${settings.promoCodeAgentInitializedAt.toISOString()}; skipping backfill`,
      );
      return outcome;
    }

    this.logger.log(`Starting WooCommerce -> Delight Desk promo code backfill for user ${userId}`);

    try {
      const iterStats = await this.wooCommerceRestApiService.iterateAllCoupons(
        userId,
        async (coupon) => {
          const result = await this.importCouponFromWooCommerce(userId, coupon);
          switch (result.kind) {
            case 'imported':
              outcome.imported += 1;
              break;
            case 'linked':
              outcome.linked += 1;
              break;
            case 'skipped':
              outcome.skipped += 1;
              break;
            case 'failed':
              outcome.failed += 1;
              this.logger.warn(
                `Failed to import WooCommerce coupon "${coupon?.code ?? '?'}" (#${coupon?.id ?? '?'}): ${result.error}`,
              );
              break;
          }
        },
        { perPage: 100, throttleMs: 200 },
      );
      outcome.pagesFetched = iterStats.pagesFetched;
      outcome.couponsSeen = iterStats.couponsSeen;
    } catch (error) {
      const message = (error as Error).message ?? 'Unknown error';
      this.logger.error(
        `Backfill iteration failed for user ${userId}: ${message}; the agent will remain uninitialized so a future enable retries`,
      );
      // Surface partial outcome so callers can still report progress; do NOT mark
      // the agent as initialized — re-enabling later will resume cleanly.
      return outcome;
    }

    // Push any pre-existing DD configurations that aren't yet linked to a WooCommerce
    // coupon so the merchant's storefront reflects them. Failures here are recorded on
    // the row by syncOne and retried by the reconciliation cron.
    const ddConfigs = await this.promoCodeConfigsRepo.listByUserId(userId);
    for (const config of ddConfigs) {
      if (config.wooCommerceCouponId) continue;
      const result = await this.syncOne(config);
      if (result.ok) outcome.pushedExistingDdConfigs += 1;
    }

    await this.systemSettingsRepo.markPromoCodeAgentInitialized(userId);
    this.logger.log(
      `Backfill complete for user ${userId}: imported=${outcome.imported}, linked=${outcome.linked}, skipped=${outcome.skipped}, failed=${outcome.failed}, pushed=${outcome.pushedExistingDdConfigs}`,
    );

    return outcome;
  }

  /**
   * Decides what to do with a single WooCommerce coupon during the backfill loop.
   * Order matters: we try cheaper / safer matches first, only falling through to a
   * fresh insert when nothing else applies.
   */
  private async importCouponFromWooCommerce(
    userId: string,
    coupon: any,
  ): Promise<BackfillImportResult> {
    if (!coupon || typeof coupon.id !== 'number' || typeof coupon.code !== 'string') {
      return { kind: 'skipped', reason: 'malformed coupon payload' };
    }

    const wcCouponId: number = coupon.id;
    const code: string = coupon.code;

    // 1. Already linked by stored WC coupon id → skip.
    const byWcId = await this.promoCodeConfigsRepo.findByUserAndWooCouponId(userId, wcCouponId);
    if (byWcId) {
      return { kind: 'skipped', reason: 'already linked by wooCommerceCouponId' };
    }

    // 2. Coupon was originally created by Delight Desk (carries our self-marker meta) and
    //    points to an existing DD row → skip; this is one of our own coupons.
    const ddConfigIdMeta = this.readDelightDeskConfigIdFromMeta(coupon);
    if (ddConfigIdMeta) {
      const own = await this.promoCodeConfigsRepo.findByIdAndUserId(ddConfigIdMeta, userId);
      if (own) {
        // Heal the link if WC's coupon id changed since it was last synced.
        if (own.wooCommerceCouponId !== wcCouponId) {
          await this.promoCodeConfigsRepo.updateSyncMetadata(own.id, {
            wooCommerceCouponId: wcCouponId,
            lastSyncedAt: new Date(),
          });
        }
        return {
          kind: 'skipped',
          reason: 'managed by Delight Desk (matched _delightdesk_config_id)',
        };
      }
    }

    // 3. Skip expired or exhausted coupons. The agent only operates on currently usable
    //    codes, and importing dead codes wastes UI space.
    if (this.isExpired(coupon) || this.isExhausted(coupon)) {
      return { kind: 'skipped', reason: 'expired or exhausted on WooCommerce' };
    }

    // 4. A DD row with the same code already exists → link to it. We do NOT overwrite
    //    the merchant's existing fields; we only fill in the WC sync metadata.
    const byCode = await this.promoCodeConfigsRepo.findByUserAndCodeCaseInsensitive(userId, code);
    if (byCode) {
      await this.promoCodeConfigsRepo.updateSyncMetadata(byCode.id, {
        wooCommerceCouponId: wcCouponId,
        lastSyncedAt: new Date(),
        lastSyncError: null,
      });
      return { kind: 'linked', configId: byCode.id };
    }

    // 5. Create a fresh DD row. mapWooCouponToDelightDeskConfig sets DD-only fields to
    //    sensible defaults; isActive may be false if we detected restrictions DD does
    //    not model so the agent never auto-refunds something it can't reason about.
    try {
      const createInput = this.mapWooCouponToDelightDeskConfig(userId, coupon);
      const created = await this.promoCodeConfigsRepo.create(createInput);
      return { kind: 'imported', configId: created.id };
    } catch (error) {
      return { kind: 'failed', error: (error as Error).message ?? 'Unknown error' };
    }
  }

  /**
   * Maps a WooCommerce coupon into the create-input shape expected by the
   * promo-code-configurations repository.
   *
   * Defaults applied for DD-only fields:
   *   - usageType: inferred from `usage_limit_per_user` (1 -> first_time_customer_discount,
   *     else general_discount_inquiry — the most permissive default).
   *   - maxRefundAmount: copied from the discount value when discountType=fixed_amount,
   *     else null (no cap; merchant can edit in DD UI).
   *   - appliesToSubscriptions: false. Merchant must opt-in explicitly in DD UI to
   *     extend a code to subscription renewals.
   *   - isActive: true unless WooCommerce reports restrictions Delight Desk doesn't
   *     fully model (free_shipping, email_restrictions, product/category restrictions).
   *     In that case isActive=false and the raw restrictions blob is stored on the row
   *     so the merchant can review them and decide whether to enable.
   */
  private mapWooCouponToDelightDeskConfig(
    userId: string,
    coupon: any,
  ): Omit<PromoCodeConfigurationEntity, 'id' | 'createdAt' | 'updatedAt'> {
    const wcDiscountType = (coupon.discount_type ?? 'percent') as string;
    const isPercent = wcDiscountType === 'percent';
    const amountString = typeof coupon.amount === 'string' ? coupon.amount : null;

    const discountType: 'percentage' | 'fixed_amount' = isPercent ? 'percentage' : 'fixed_amount';

    const discountPercentage = isPercent ? this.normalizeNumericString(amountString) : null;
    const maxRefundAmount = isPercent ? null : this.normalizeNumericString(amountString);

    const usageLimitPerUser =
      typeof coupon.usage_limit_per_user === 'number' ? coupon.usage_limit_per_user : null;
    const usageType =
      usageLimitPerUser === 1 ? 'first_time_customer_discount' : 'general_discount_inquiry';

    const restrictions = this.extractUnsupportedRestrictions(coupon);
    const isActive = restrictions === null;

    const validUntil = this.parseWcDate(coupon.date_expires_gmt ?? coupon.date_expires);
    const minimumOrderValue = this.normalizeNumericString(coupon.minimum_amount);
    const maxUsageCount =
      typeof coupon.usage_limit === 'number' && coupon.usage_limit > 0 ? coupon.usage_limit : null;

    // validFrom resolution priority:
    //   1. `_delightdesk_valid_from` meta marker — present on coupons we previously
    //      pushed from Delight Desk; lets the original start date round-trip cleanly.
    //   2. `date_created_gmt` — for externally-created WooCommerce coupons. WC has no
    //      native "valid from" field, so the moment the coupon began existing in WC
    //      is the closest semantic match (the coupon was usable from that point on).
    const validFromFromMeta = this.parseWcDate(
      this.readDelightDeskMetaValue(coupon, '_delightdesk_valid_from'),
    );
    const validFrom = validFromFromMeta ?? this.parseWcDate(coupon.date_created_gmt);

    return {
      userId,
      promoCode: coupon.code,
      description:
        typeof coupon.description === 'string' && coupon.description.trim().length > 0
          ? coupon.description
          : null,
      isActive,
      usageType,
      discountType,
      discountPercentage,
      maxRefundAmount,
      validFrom,
      validUntil,
      minimumOrderValue,
      maxUsageCount,
      appliesToSubscriptions: false,
      wooCommerceCouponId: typeof coupon.id === 'number' ? coupon.id : null,
      lastSyncedAt: new Date(),
      lastSyncError: null,
      wcRestrictionsRaw: restrictions,
    };
  }

  /**
   * Builds a partial update payload for an existing Delight Desk row when WooCommerce
   * notifies us a coupon changed. This intentionally touches ONLY fields that
   * WooCommerce is authoritative for. Fields the merchant manages exclusively in
   * Delight Desk — `usageType`, `appliesToSubscriptions`, `description` (when blank
   * in WC), and the percentage cap aspect of `maxRefundAmount` — are NOT included so
   * a merchant's custom DD configuration cannot be silently overwritten by a WC edit.
   *
   * Special handling:
   *   - When the WC coupon's restriction shape changes (e.g. someone adds product
   *     restrictions in wp-admin), we flip `isActive` to false and stash the raw
   *     restrictions so the agent stops auto-refunding it.
   *   - When `discount_type` changes (percent <-> fixed), we update both the type and
   *     the value field that's now meaningful, but leave the now-meaningless field
   *     untouched (rather than nulling it) so a quick toggle-back doesn't lose data.
   */
  buildDelightDeskUpdateFromWooCoupon(coupon: any): Partial<PromoCodeConfigurationEntity> {
    const wcDiscountType = (coupon.discount_type ?? 'percent') as string;
    const isPercent = wcDiscountType === 'percent';
    const amountString = typeof coupon.amount === 'string' ? coupon.amount : null;

    const update: Partial<PromoCodeConfigurationEntity> = {
      promoCode: typeof coupon.code === 'string' ? coupon.code : undefined,
      discountType: isPercent ? 'percentage' : 'fixed_amount',
      validUntil: this.parseWcDate(coupon.date_expires_gmt ?? coupon.date_expires),
      minimumOrderValue: this.normalizeNumericString(coupon.minimum_amount),
      maxUsageCount:
        typeof coupon.usage_limit === 'number' && coupon.usage_limit > 0
          ? coupon.usage_limit
          : null,
    };

    if (isPercent) {
      update.discountPercentage = this.normalizeNumericString(amountString);
    } else {
      // For fixed_amount codes, the WC `amount` IS the cap value; for percentage codes
      // the cap is purely a Delight Desk concept and we never want WC to overwrite it.
      update.maxRefundAmount = this.normalizeNumericString(amountString);
    }

    // Description: only update if WC supplied a non-empty description. An empty WC
    // description should not blow away a description the merchant authored in DD.
    if (typeof coupon.description === 'string' && coupon.description.trim().length > 0) {
      update.description = coupon.description;
    }

    // validFrom: same priority order as the create mapper (meta marker > date_created_gmt).
    const validFromFromMeta = this.parseWcDate(
      this.readDelightDeskMetaValue(coupon, '_delightdesk_valid_from'),
    );
    const validFrom = validFromFromMeta ?? this.parseWcDate(coupon.date_created_gmt);
    if (validFrom) update.validFrom = validFrom;

    // Restrictions: if WooCommerce just added a feature DD doesn't model, deactivate
    // the row and snapshot the restriction blob so the agent stops touching it.
    const restrictions = this.extractUnsupportedRestrictions(coupon);
    if (restrictions !== null) {
      update.isActive = false;
      update.wcRestrictionsRaw = restrictions;
    } else {
      // Restrictions cleared in WC → clear our snapshot and re-activate. We do NOT
      // re-activate if the merchant manually disabled the row in DD; only when the
      // earlier reason for deactivation was a WC restriction we're now unwinding.
      update.wcRestrictionsRaw = null;
    }

    update.lastSyncedAt = new Date();
    update.lastSyncError = null;

    return update;
  }

  /**
   * Public webhook integration helper. Routes an incoming WooCommerce coupon event
   * (created/updated/deleted) to the right Delight Desk action. Intentionally does
   * NOT verify the webhook signature — that's the controller's job before this is
   * called. By the time we get here we trust the payload.
   *
   * Returns a small string discriminator so the webhook handler can log a precise
   * outcome without needing to know about repository internals.
   */
  async applyIncomingWooCommerceCoupon(input: {
    userId: string;
    topic: 'coupon.created' | 'coupon.updated' | 'coupon.deleted';
    coupon: any;
  }): Promise<
    | { kind: 'created'; configId: string }
    | { kind: 'updated'; configId: string }
    | { kind: 'soft_deleted'; configId: string }
    | { kind: 'skipped'; reason: string }
  > {
    const { userId, topic, coupon } = input;

    if (!coupon || typeof coupon.id !== 'number') {
      return { kind: 'skipped', reason: 'malformed coupon payload (no numeric id)' };
    }

    const wcCouponId: number = coupon.id;

    // -------- DELETED branch --------
    if (topic === 'coupon.deleted') {
      const existing = await this.promoCodeConfigsRepo.findByUserAndWooCouponId(userId, wcCouponId);
      if (!existing) {
        return { kind: 'skipped', reason: 'no DD row matched for delete' };
      }
      // Soft-delete: keep the row so refund history / escalations referring to this
      // code still resolve. A hard delete would orphan those references.
      await this.promoCodeConfigsRepo.update(existing.id, userId, {
        isActive: false,
        lastSyncedAt: new Date(),
      });
      return { kind: 'soft_deleted', configId: existing.id };
    }

    // -------- CREATED / UPDATED branch --------
    // Try to locate the matching DD row by id first, then by the self-marker meta,
    // then by code (case-insensitive). Mirrors the priority used in the backfill
    // importer so created and updated events that arrive out of order still resolve
    // to the same row.
    let existing = await this.promoCodeConfigsRepo.findByUserAndWooCouponId(userId, wcCouponId);

    if (!existing) {
      const metaConfigId = this.readDelightDeskMetaValue(coupon, '_delightdesk_config_id');
      if (metaConfigId) {
        existing = await this.promoCodeConfigsRepo.findByIdAndUserId(metaConfigId, userId);
      }
    }

    if (!existing && typeof coupon.code === 'string') {
      existing = await this.promoCodeConfigsRepo.findByUserAndCodeCaseInsensitive(
        userId,
        coupon.code,
      );
    }

    if (existing) {
      const updates = this.buildDelightDeskUpdateFromWooCoupon(coupon);
      // Always persist the WC coupon id link in case the row was matched by code or
      // meta and didn't have it set (or had a stale one).
      const updated = await this.promoCodeConfigsRepo.update(existing.id, userId, {
        ...updates,
        wooCommerceCouponId: wcCouponId,
      });
      return { kind: 'updated', configId: (updated ?? existing).id };
    }

    // No match → treat as a fresh create. Reuse the create mapper which sets DD-only
    // defaults (usageType, appliesToSubscriptions, etc.). isExpired/isExhausted are
    // NOT enforced here because a webhook explicitly told us to act on this coupon;
    // ignoring it because the merchant happened to set an expired date would be
    // surprising.
    const createInput = this.mapWooCouponToDelightDeskConfig(userId, coupon);
    const created = await this.promoCodeConfigsRepo.create(createInput);
    return { kind: 'created', configId: created.id };
  }

  private isExpired(coupon: any): boolean {
    const expires = this.parseWcDate(coupon?.date_expires_gmt ?? coupon?.date_expires);
    if (!expires) return false;
    return expires.getTime() < Date.now();
  }

  private isExhausted(coupon: any): boolean {
    const limit = typeof coupon?.usage_limit === 'number' ? coupon.usage_limit : 0;
    const used = typeof coupon?.usage_count === 'number' ? coupon.usage_count : 0;
    return limit > 0 && used >= limit;
  }

  /**
   * Detects WooCommerce coupon features Delight Desk does not fully model. Returns
   * a JSON blob of the restriction fields when at least one is set; otherwise null.
   * The agent treats coupons with non-null restrictions as `isActive=false` so it
   * never auto-refunds a code whose redemption rules it cannot evaluate.
   */
  private extractUnsupportedRestrictions(coupon: any): Record<string, unknown> | null {
    const out: Record<string, unknown> = {};

    if (coupon?.free_shipping === true) out.freeShipping = true;
    if (Array.isArray(coupon?.email_restrictions) && coupon.email_restrictions.length > 0) {
      out.emailRestrictions = coupon.email_restrictions;
    }
    if (Array.isArray(coupon?.product_ids) && coupon.product_ids.length > 0) {
      out.productIds = coupon.product_ids;
    }
    if (Array.isArray(coupon?.excluded_product_ids) && coupon.excluded_product_ids.length > 0) {
      out.excludedProductIds = coupon.excluded_product_ids;
    }
    if (Array.isArray(coupon?.product_categories) && coupon.product_categories.length > 0) {
      out.productCategories = coupon.product_categories;
    }
    if (
      Array.isArray(coupon?.excluded_product_categories) &&
      coupon.excluded_product_categories.length > 0
    ) {
      out.excludedProductCategories = coupon.excluded_product_categories;
    }
    if (typeof coupon?.limit_usage_to_x_items === 'number' && coupon.limit_usage_to_x_items > 0) {
      out.limitUsageToXItems = coupon.limit_usage_to_x_items;
    }

    return Object.keys(out).length > 0 ? out : null;
  }

  private readDelightDeskConfigIdFromMeta(coupon: any): string | null {
    return this.readDelightDeskMetaValue(coupon, '_delightdesk_config_id');
  }

  /**
   * Reads a string value from a WooCommerce coupon's `meta_data` array by key.
   * Returns null when the key is missing, the value isn't a non-empty string, or
   * the meta_data shape is malformed. Used to recover round-trip metadata Delight
   * Desk previously wrote (config id, valid_from, etc.).
   */
  private readDelightDeskMetaValue(coupon: any, key: string): string | null {
    if (!Array.isArray(coupon?.meta_data)) return null;
    const entry = coupon.meta_data.find(
      (m: any) => m && m.key === key && typeof m.value === 'string' && m.value.trim().length > 0,
    );
    return entry?.value ?? null;
  }

  /**
   * Accepts WooCommerce timestamp strings (which omit the trailing 'Z' on `_gmt`
   * fields) and returns a Date or null. Tolerates non-string inputs.
   */
  private parseWcDate(value: unknown): Date | null {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.endsWith('Z') ? value : `${value}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private normalizeNumericString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const asNumber = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(asNumber)) return null;
    // WooCommerce serializes "0" / "0.00" for unset numeric fields. Treat those as
    // null in Delight Desk so the UI doesn't surface meaningless zeros (which would
    // otherwise look like "minimum order value: $0" or "max usage: 0 = exhausted").
    if (asNumber === 0) return null;
    return asNumber.toString();
  }
}
