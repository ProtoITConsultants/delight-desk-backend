import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const userSessions = pgTable('user_sessions', {
  sid: text('sid').primaryKey(),
  sess: text('sess').notNull(),
  expire: timestamp('expire', { withTimezone: false }).notNull(),
});
