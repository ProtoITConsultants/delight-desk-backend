import { pgTable, varchar, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './index';

export const userStoreConnections = pgTable('user_store_connections', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  platform: varchar('platform', { length: 50 }),
  storeUrl: varchar('store_url', { length: 255 }).notNull(),
  apiKey: varchar('api_key', { length: 255 }),
  apiSecret: varchar('api_secret', { length: 255 }),
  connectionMethod: varchar('connection_method', { length: 50 }),
  isActive: boolean('is_active').default(true),

  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
