import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './index';

export const userOAuthAccounts = pgTable('user_oauth_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull().unique(),
  provider: text('provider'), // 'google' | 'microsoft'
  providerUserId: text('provider_user_id'),
  status: text('status').default('connected').notNull(), // 'connected' | 'disconnected'
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  scopes: text('scopes').array(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

  // For outlook subscription management
  subscriptionId: text('subscription_id').unique(),
  subscriptionExpiry: timestamp('subscription_expiry'),

  // For google watch management
  lastHistoryId: text('last_history_id'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
