import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { billingPlans, subscriptions } from './index';

export const subscriptionHistory = pgTable('subscription_history', {
  id: uuid('id').primaryKey().defaultRandom(),

  subscriptionId: uuid('subscription_id')
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),

  oldPlanId: uuid('old_plan_id').references(() => billingPlans.id),
  newPlanId: uuid('new_plan_id').references(() => billingPlans.id),

  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
});
