import { InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const promoCodeUsageTypes = [
  'refund_only',
  'first_time_customer_discount',
  'general_discount_inquiry',
  'refund_and_new_customer_offer',
] as const;

export type PromoCodeUsageType = (typeof promoCodeUsageTypes)[number];

export const promoCodeDiscountTypes = ['percentage', 'fixed_amount'] as const;
export type PromoCodeDiscountType = (typeof promoCodeDiscountTypes)[number];

export const promoCodeConfigurations = pgTable('promo_code_configurations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  promoCode: text('promo_code').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  usageType: text('usage_type').notNull().default('first_time_customer_discount'),
  discountType: text('discount_type').notNull().default('percentage'),
  discountPercentage: numeric('discount_percentage', { precision: 5, scale: 2 }),
  maxRefundAmount: numeric('max_refund_amount', { precision: 12, scale: 2 }),
  validFrom: timestamp('valid_from', { withTimezone: true }),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  minimumOrderValue: numeric('minimum_order_value', { precision: 12, scale: 2 }),
  maxUsageCount: integer('max_usage_count'),
  appliesToSubscriptions: boolean('applies_to_subscriptions').default(false).notNull(),
  // WooCommerce coupon sync metadata. Populated by the one-way Delight Desk -> WooCommerce
  // sync. wooCommerceCouponId is the numeric coupon id returned by WooCommerce; lastSyncedAt
  // tracks the most recent successful sync; lastSyncError captures the last failure (if any)
  // so the UI can surface why a sync attempt did not propagate.
  wooCommerceCouponId: integer('woocommerce_coupon_id'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastSyncError: text('last_sync_error'),
  // Raw WooCommerce restrictions snapshot for coupons whose features Delight Desk does
  // not fully model (free_shipping, email_restrictions, product/category restrictions).
  // When non-null, the row was imported with `isActive=false` so the agent never
  // refunds a coupon whose redemption rules it cannot reason about. Merchants can
  // review the restrictions in the DD UI and decide whether to enable the row.
  wcRestrictionsRaw: jsonb('wc_restrictions_raw').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type PromoCodeConfigurationEntity = InferSelectModel<typeof promoCodeConfigurations>;
