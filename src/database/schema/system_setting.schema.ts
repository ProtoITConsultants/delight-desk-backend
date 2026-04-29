import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './index';

export const systemSettings = pgTable('system_settings', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Wismo Settings
  hasTrackingPluginForWoocommerce: boolean('has_tracking_plugin_for_woocommerce')
    .default(false)
    .notNull(),

  // Fulfillment Settings
  fulfillmentMethod: text('fulfillment_method').notNull().default('self'),
  warehouseEmail: text('warehouse_email'),
  shipbobPersonalAccessToken: text('shipbob_personal_access_token'),
  shipbobChannelId: text('shipbob_channel_id'),
  shipstationApiKey: text('shipstation_api_key'),

  // Promo Code Agent customization. Merchant-authored tone hint the Promo Code Agent
  // injects into AI prompts when explaining to a returning customer why a first-time-only
  // promo code did not apply for them (Scenario 2). Optional — when null the agent uses
  // its default plain-spoken style.
  //
  // The previous `promoCodeApplicationGuidance` column was removed once the agent
  // switched to grounding application-guidance replies in product knowledge retrieval.
  promoCodeExistingCustomerDenialNote: text('promo_code_existing_customer_denial_note'),

  // Timestamp of the first successful WooCommerce -> Delight Desk backfill triggered
  // when the merchant initially enabled the Promo Code Agent. Once this is set, the
  // backfill never runs again — the live webhook + reconciliation cron handle ongoing
  // updates. NULL means the agent has never been enabled, OR an enable was attempted
  // but the backfill failed before completing.
  promoCodeAgentInitializedAt: timestamp('promo_code_agent_initialized_at', {
    withTimezone: true,
  }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
