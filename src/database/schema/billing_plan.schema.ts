import { decimal, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const billingPlans = pgTable('billing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),

  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull().unique(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  resolutions: integer('resolutions').notNull(),
  costPerResolution: decimal('cost_per_resolution', { precision: 10, scale: 2 }).notNull(),
  emailLimit: integer('email_limit'),
  features: jsonb('features').$type<string[]>().notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
