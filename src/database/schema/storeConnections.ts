import { pgTable, serial, varchar, boolean, timestamp, uuid  } from 'drizzle-orm/pg-core';

export const storeConnections = pgTable('store_connections', {
  id: uuid('id').primaryKey().defaultRandom(), // ✅ auto-generate UUID using gen_random_uuid() .primaryKey(),
  userid: varchar('userid', { length: 255 }).notNull(), // changed from integer to varchar
  platform: varchar('platform', { length: 50 }).notNull(),
  store_name: varchar('store_name', { length: 255 }).notNull(),
  store_url: varchar('store_url', { length: 255 }).notNull(),
  api_key: varchar('api_key', { length: 255 }),
  api_secret: varchar('api_secret', { length: 255 }),
    // --- For OAuth connections ---
  oauth_token: varchar('oauth_token', { length: 255 }), // permanent access token
  oauth_token_secret: varchar('oauth_token_secret', { length: 255 }), // secret for signing
  oauth_verifier: varchar('oauth_verifier', { length: 255 }), // optional, for initial callback validation
  connection_method: varchar('connection_method', { length: 50 }),
  is_active: boolean('is_active').default(true),
  created_at: timestamp('created_at',{ withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at',{ withTimezone: true }).defaultNow(),
});
