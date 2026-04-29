import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromoCodeConfigurationsRepository } from 'src/database/repos/promo-code-configurations.repository';
import { UserStoreConnectionsRepository } from 'src/database/repos/user-store-connections.repository';
import { WooCommerceWebhookSubscriptionsRepository } from 'src/database/repos/woocommerce-webhook-subscriptions.repository';
import { WooCommerceWebhookTopic, wooCommerceWebhookTopics } from 'src/database/schema';
import { WooCommerceRestApiService } from '../woocommerce/woocommerce-rest-api.service';
import { WooCommerceCouponSyncService } from './woocommerce-coupon-sync.service';

/**
 * Three-layer sync-loop guard inputs returned to the controller for logging.
 */
interface ProcessOutcome {
  ok: boolean;
  action:
    | 'created'
    | 'updated'
    | 'soft_deleted'
    | 'skipped_self_echo'
    | 'skipped_recent_push'
    | 'skipped_unchanged'
    | 'skipped_no_match'
    | 'skipped_malformed';
  reason?: string;
  configId?: string;
}

/**
 * Owns the WooCommerce webhook lifecycle for the Promo Code Agent:
 *   - Register one webhook per topic when the agent is enabled.
 *   - Verify HMAC-SHA256 signatures on incoming deliveries.
 *   - Apply three sync-loop guards (recently-pushed cache, self-marker meta,
 *     payload hash equality) so DD's own pushes don't bounce back as imports.
 *   - Tear down webhooks when the agent is disabled.
 *
 * Controller -> Service contract: the controller validates the request shape and
 * extracts headers/userId, then delegates a single `handleIncomingCouponEvent` call.
 * The service handles signature verification, guards, and routing to the sync
 * service's `applyIncomingWooCommerceCoupon` for the actual DD mutation.
 */
@Injectable()
export class WooCommerceCouponWebhookService {
  private readonly logger = new Logger(WooCommerceCouponWebhookService.name);

  /**
   * Hash-equality guard: per-DD-row last-applied payload hash, in memory. Bounded by
   * the number of distinct configurations seen in the current process lifetime; we
   * don't bother evicting because the keys are config UUIDs and the values are
   * 64-char hex strings (a few KB at most for typical merchants).
   */
  private readonly lastAppliedHashByConfigId = new Map<string, string>();

  constructor(
    private readonly subscriptionsRepo: WooCommerceWebhookSubscriptionsRepository,
    private readonly storeConnectionsRepo: UserStoreConnectionsRepository,
    private readonly promoCodeConfigsRepo: PromoCodeConfigurationsRepository,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
    private readonly wooCommerceCouponSyncService: WooCommerceCouponSyncService,
    private readonly configService: ConfigService,
  ) {}

  // ===================================================================================
  // Registration / teardown
  // ===================================================================================

  /**
   * Registers one webhook per coupon topic with the merchant's WooCommerce store and
   * persists the secrets we'll need to verify deliveries. Idempotent: if a
   * subscription already exists for a (userId, topic) pair we skip that topic so a
   * second enable doesn't create duplicate WC-side webhooks.
   *
   * Returns counts so the caller / cron can log progress. Errors on individual topics
   * are caught and reported in `failed` so a transient WC failure doesn't abort
   * registering the other two topics.
   */
  async registerCouponWebhooks(
    userId: string,
  ): Promise<{ registered: number; skipped: number; failed: number }> {
    const baseUrl = this.getWebhookBaseUrl();
    if (!baseUrl) {
      this.logger.warn(
        'WOOCOMMERCE_WEBHOOK_BASE_URL is not configured; coupon webhook registration is disabled. The reconciliation cron will keep DD and WC in sync at a slower cadence.',
      );
      return { registered: 0, skipped: 0, failed: 0 };
    }

    if (!(await this.userHasWooCommerceConnection(userId))) {
      this.logger.warn(
        `Cannot register coupon webhooks: WooCommerce store not connected for user ${userId}`,
      );
      return { registered: 0, skipped: 0, failed: 0 };
    }

    const existing = await this.subscriptionsRepo.listByUser(userId);
    const existingTopics = new Set(existing.map((row) => row.topic));

    const deliveryUrl = this.buildDeliveryUrl(baseUrl, userId);

    let registered = 0;
    let skipped = 0;
    let failed = 0;

    for (const topic of wooCommerceWebhookTopics) {
      if (existingTopics.has(topic)) {
        skipped += 1;
        continue;
      }

      try {
        const secret = this.generateSecret();
        const wcWebhook = await this.wooCommerceRestApiService.createWebhook(userId, {
          topic,
          delivery_url: deliveryUrl,
          secret,
          name: `Delight Desk – ${topic}`,
          status: 'active',
        });

        if (typeof wcWebhook?.id !== 'number') {
          throw new Error('WooCommerce did not return a numeric webhook id');
        }

        await this.subscriptionsRepo.create({
          userId,
          topic,
          wcWebhookId: wcWebhook.id,
          secret,
          deliveryUrl,
          status: 'active',
        });
        registered += 1;
        this.logger.log(
          `Registered ${topic} webhook for user ${userId} (wcWebhookId=${wcWebhook.id})`,
        );
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Failed to register ${topic} webhook for user ${userId}: ${(error as Error).message}`,
        );
      }
    }

    return { registered, skipped, failed };
  }

  /**
   * Best-effort teardown. Tries to delete each WooCommerce-side webhook and removes
   * our local row regardless of WC's response — a 404 on the WC side just means the
   * webhook was already deleted, which is fine. Failures are logged so an operator
   * can clean up manually if a tenant disconnected before disabling.
   */
  async unregisterCouponWebhooks(userId: string): Promise<void> {
    const subscriptions = await this.subscriptionsRepo.listByUser(userId);
    if (subscriptions.length === 0) return;

    const stillConnected = await this.userHasWooCommerceConnection(userId);

    for (const sub of subscriptions) {
      if (stillConnected) {
        try {
          await this.wooCommerceRestApiService.deleteWebhook(userId, sub.wcWebhookId);
        } catch (error) {
          this.logger.warn(
            `Failed to delete WC webhook ${sub.wcWebhookId} (${sub.topic}) for user ${userId}: ${(error as Error).message}; removing local subscription anyway`,
          );
        }
      }
      await this.subscriptionsRepo.deleteById(sub.id);
    }

    this.logger.log(`Unregistered ${subscriptions.length} coupon webhook(s) for user ${userId}`);
  }

  // ===================================================================================
  // Incoming event handling
  // ===================================================================================

  /**
   * Entry point called by the webhook controller. The controller has already extracted
   * the userId (from the URL query) and the headers. This method:
   *   1. Loads the persisted subscription row to get the per-user secret.
   *   2. Verifies the HMAC-SHA256 signature against the raw body bytes.
   *   3. Optionally cross-checks the WooCommerce source URL against the connected store.
   *   4. Applies the three sync-loop guards.
   *   5. Hands off to the sync service for the actual DD mutation.
   *
   * Throws on unauthenticated/malformed requests so the controller returns 401/400.
   * Returns `ProcessOutcome` so the controller can log the action that was taken.
   */
  async handleIncomingCouponEvent(input: {
    userId: string;
    topic: string;
    signatureHeader: string | undefined;
    sourceHeader: string | undefined;
    rawBody: Buffer;
    payload: any;
  }): Promise<ProcessOutcome> {
    const { userId, topic, signatureHeader, sourceHeader, rawBody, payload } = input;

    if (!this.isKnownCouponTopic(topic)) {
      // Defensive: WC should only deliver topics we registered, but if it ever sends
      // something unexpected we drop it rather than process arbitrary events.
      return {
        ok: false,
        action: 'skipped_malformed',
        reason: `unsupported topic ${topic}`,
      };
    }

    const subscription = await this.subscriptionsRepo.findByUserAndTopic(userId, topic);
    if (!subscription) {
      // No registration for this user/topic. Could be a stale webhook still firing
      // after we tore down our subscription. We refuse rather than guess.
      return {
        ok: false,
        action: 'skipped_no_match',
        reason: 'no active subscription for this user/topic',
      };
    }

    if (!signatureHeader || !this.verifySignature(signatureHeader, rawBody, subscription.secret)) {
      // Logging at warn level so a brute-force attempt is visible without bringing
      // the request count to error volumes.
      this.logger.warn(
        `Rejected coupon webhook for user ${userId} (topic=${topic}): invalid or missing signature`,
      );
      return {
        ok: false,
        action: 'skipped_malformed',
        reason: 'invalid signature',
      };
    }

    // Defense in depth: verify the source header matches the user's connected store
    // URL. A leaked secret + a forged delivery URL would still fail this check
    // because we'd see a foreign storefront URL.
    if (sourceHeader) {
      const connection = await this.storeConnectionsRepo.findByPlatform(userId, 'woocommerce');
      if (connection?.storeUrl && !this.sourceMatchesStore(sourceHeader, connection.storeUrl)) {
        this.logger.warn(
          `Rejected coupon webhook for user ${userId} (topic=${topic}): source header "${sourceHeader}" does not match connected store "${connection.storeUrl}"`,
        );
        return {
          ok: false,
          action: 'skipped_malformed',
          reason: 'source store mismatch',
        };
      }
    }

    // Stamp lastEventAt regardless of subsequent guard outcomes — the delivery WAS
    // received and authenticated, which is useful diagnostics on its own.
    await this.subscriptionsRepo.stampLastEventAt(subscription.id);

    // === Sync-loop guards ===

    // Guard 1: recently-pushed cache. Drops events for coupons we just pushed (60s TTL).
    const wcCouponId =
      typeof payload?.id === 'number'
        ? (payload.id as number)
        : typeof payload?.id === 'string'
          ? Number(payload.id)
          : NaN;
    if (
      Number.isFinite(wcCouponId) &&
      this.wooCommerceCouponSyncService.isCouponRecentlyPushed(wcCouponId)
    ) {
      return {
        ok: true,
        action: 'skipped_recent_push',
        reason: `coupon ${wcCouponId} was pushed by Delight Desk within the recently-pushed TTL`,
      };
    }

    // Guard 2: self-marker meta. If the payload is a coupon we created and its
    // date_modified is within 10s of the matched DD row's updatedAt, drop it.
    if (this.isSelfEcho(payload)) {
      const ddConfigIdMeta = this.readDelightDeskMetaValue(payload, '_delightdesk_config_id');
      if (ddConfigIdMeta) {
        const own = await this.promoCodeConfigsRepo.findByIdAndUserId(ddConfigIdMeta, userId);
        if (own) {
          const wcModifiedAt = this.parseWcDate(payload?.date_modified_gmt);
          const ddUpdatedAt = own.updatedAt instanceof Date ? own.updatedAt : null;
          if (
            wcModifiedAt &&
            ddUpdatedAt &&
            Math.abs(wcModifiedAt.getTime() - ddUpdatedAt.getTime()) <= 10_000
          ) {
            return {
              ok: true,
              action: 'skipped_self_echo',
              reason: 'WC payload matches DD-managed row written within last 10s',
              configId: own.id,
            };
          }
        }
      }
    }

    // Guard 3: hash equality. If we've already applied an identical payload to this
    // row, skip the redundant write. Useful when the same delivery is retried by WC
    // after a transient failure on our side.
    const candidateConfig = Number.isFinite(wcCouponId)
      ? await this.promoCodeConfigsRepo.findByUserAndWooCouponId(userId, wcCouponId)
      : null;
    if (candidateConfig && topic !== 'coupon.deleted') {
      const incomingHash = this.hashCanonicalPayload(payload);
      const lastHash = this.lastAppliedHashByConfigId.get(candidateConfig.id);
      if (lastHash && lastHash === incomingHash) {
        return {
          ok: true,
          action: 'skipped_unchanged',
          reason: 'payload hash matches last applied write',
          configId: candidateConfig.id,
        };
      }
    }

    // === Apply the change ===

    const result = await this.wooCommerceCouponSyncService.applyIncomingWooCommerceCoupon({
      userId,
      topic: topic as 'coupon.created' | 'coupon.updated' | 'coupon.deleted',
      coupon: payload,
    });

    if (result.kind === 'skipped') {
      return { ok: true, action: 'skipped_no_match', reason: result.reason };
    }

    // Update the per-config hash so future redundant deliveries are caught above.
    if (topic !== 'coupon.deleted') {
      this.lastAppliedHashByConfigId.set(result.configId, this.hashCanonicalPayload(payload));
    } else {
      this.lastAppliedHashByConfigId.delete(result.configId);
    }

    return { ok: true, action: result.kind, configId: result.configId };
  }

  // ===================================================================================
  // Helpers
  // ===================================================================================

  private getWebhookBaseUrl(): string | null {
    const raw = this.configService.get<string>('WOOCOMMERCE_WEBHOOK_BASE_URL');
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
  }

  /**
   * Per-user delivery URL. The user id sits in the query string so the receiver can
   * identify the tenant before doing any DB lookups (the secret in the table is what
   * actually authenticates the call). We deliberately avoid putting any secret in the
   * URL — only the tenant identifier, which is not sensitive.
   */
  private buildDeliveryUrl(baseUrl: string, userId: string): string {
    return `${baseUrl}/woocommerce/webhooks/coupons?u=${encodeURIComponent(userId)}`;
  }

  private generateSecret(): string {
    // 32 bytes = 256 bits, hex-encoded -> 64 chars. Plenty for HMAC-SHA256.
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * WooCommerce signs each delivery as base64(HMAC_SHA256(secret, raw_body)). We use
   * `timingSafeEqual` to defeat string-comparison timing oracles. Length mismatches
   * short-circuit because timingSafeEqual would throw.
   */
  private verifySignature(receivedHeader: string, rawBody: Buffer, secret: string): boolean {
    try {
      const computed = crypto.createHmac('sha256', secret).update(rawBody).digest();
      const received = Buffer.from(receivedHeader, 'base64');
      if (received.length !== computed.length) return false;
      return crypto.timingSafeEqual(received, computed);
    } catch {
      return false;
    }
  }

  /**
   * The WC `x-wc-webhook-source` header is the storefront URL (e.g. `https://shop.example.com/`)
   * with possible trailing slashes. Compare host + protocol after normalization.
   */
  private sourceMatchesStore(sourceHeader: string, storeUrl: string): boolean {
    try {
      const a = new URL(sourceHeader);
      const b = new URL(storeUrl);
      return a.host.toLowerCase() === b.host.toLowerCase();
    } catch {
      return false;
    }
  }

  private isKnownCouponTopic(topic: string): topic is WooCommerceWebhookTopic {
    return (wooCommerceWebhookTopics as readonly string[]).includes(topic);
  }

  private isSelfEcho(payload: any): boolean {
    return (
      Array.isArray(payload?.meta_data) &&
      payload.meta_data.some(
        (m: any) => m && m.key === '_delightdesk_managed' && String(m.value) === 'true',
      )
    );
  }

  private readDelightDeskMetaValue(coupon: any, key: string): string | null {
    if (!Array.isArray(coupon?.meta_data)) return null;
    const entry = coupon.meta_data.find(
      (m: any) => m && m.key === key && typeof m.value === 'string' && m.value.trim().length > 0,
    );
    return entry?.value ?? null;
  }

  private parseWcDate(value: unknown): Date | null {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.endsWith('Z') ? value : `${value}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Canonical JSON of the WC fields we actually apply, hashed with SHA-256. Keeping
   * the canonicalization explicit means a reordered key set or an extra meta entry
   * doesn't accidentally invalidate the hash and force a redundant write.
   */
  private hashCanonicalPayload(coupon: any): string {
    const canonical = JSON.stringify({
      code: coupon?.code ?? null,
      discount_type: coupon?.discount_type ?? null,
      amount: coupon?.amount ?? null,
      description: typeof coupon?.description === 'string' ? coupon.description : null,
      date_expires_gmt: coupon?.date_expires_gmt ?? null,
      date_created_gmt: coupon?.date_created_gmt ?? null,
      minimum_amount: coupon?.minimum_amount ?? null,
      usage_limit: coupon?.usage_limit ?? null,
      usage_limit_per_user: coupon?.usage_limit_per_user ?? null,
      free_shipping: coupon?.free_shipping ?? null,
      email_restrictions: coupon?.email_restrictions ?? null,
      product_ids: coupon?.product_ids ?? null,
      excluded_product_ids: coupon?.excluded_product_ids ?? null,
      product_categories: coupon?.product_categories ?? null,
      excluded_product_categories: coupon?.excluded_product_categories ?? null,
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  private async userHasWooCommerceConnection(userId: string): Promise<boolean> {
    const connection = await this.storeConnectionsRepo.findByPlatform(userId, 'woocommerce');
    return !!connection?.apiKey && !!connection?.apiSecret && !!connection?.storeUrl;
  }
}
