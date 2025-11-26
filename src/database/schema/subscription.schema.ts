import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { users, billingPlans } from './index';

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  planId: uuid('plan_id')
    .notNull()
    .references(() => billingPlans.id, { onDelete: 'cascade' }),

  stripeSubscriptionId: text('stripe_subscription_id').notNull(),

  status: text('status').notNull(), // active | trialing | past_due | canceled

  currentPeriodStart: timestamp('current_period_start', {
    withTimezone: true,
  }).notNull(),

  currentPeriodEnd: timestamp('current_period_end', {
    withTimezone: true,
  }).notNull(),

  cancelAtPeriodEnd: integer('cancel_at_period_end'),

  resolutionsRemaining: integer('resolutions_remaining').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
