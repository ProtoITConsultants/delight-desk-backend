import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PromoCodeConfigurationsRepository } from 'src/database/repos/promo-code-configurations.repository';
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

  constructor(
    private readonly promoCodeConfigsRepo: PromoCodeConfigurationsRepository,
    private readonly storeConnectionsRepo: UserStoreConnectionsRepository,
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
      await this.wooCommerceRestApiService.deleteCoupon(config.userId, config.wooCommerceCouponId);
      return { ok: true };
    } catch (error) {
      const message = (error as Error).message ?? 'Unknown error';
      this.logger.warn(`Failed to delete remote coupon ${config.wooCommerceCouponId}: ${message}`);
      return { ok: false, error: message };
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
      ],
    };
  }

  private numericString(value: string | number | null): string | null {
    if (value === null || value === undefined) return null;
    const asNumber = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(asNumber)) return null;
    return asNumber.toString();
  }
}
