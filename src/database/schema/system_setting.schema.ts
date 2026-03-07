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

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
