import {
  pgTable,
  uuid,
  text,
  decimal,
  integer,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const billingPlans = pgTable('billing_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  displayName: text('display_name').notNull(),
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  resolutions: integer('resolutions').notNull(),
  costPerResolution: decimal('cost_per_resolution', { precision: 10, scale: 2 }).notNull(),
  emailLimit: integer('email_limit'),
  features: jsonb('features').$type<string[]>().notNull(),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').default(sql`NOW()`),
});
