import { pgTable, uuid, boolean, timestamp } from 'drizzle-orm/pg-core';

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

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
