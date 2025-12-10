import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),

  name: text('name').notNull().unique(),
  description: text('description'),
  icon: text('icon'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
