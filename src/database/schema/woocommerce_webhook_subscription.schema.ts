import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

/**
 * Topics Delight Desk subscribes to on a merchant's WooCommerce store. Currently only
 * coupon events are needed by the Promo Code Agent. Adding a new topic later means
 * appending to this list and wiring a handler — the table shape and the registration
 * code are topic-agnostic.
 */
export const wooCommerceWebhookTopics = [
  'coupon.created',
  'coupon.updated',
  'coupon.deleted',
] as const;

export type WooCommerceWebhookTopic = (typeof wooCommerceWebhookTopics)[number];

/**
 * One row per (user, topic) registration. Stores everything we need to verify
 * incoming webhook deliveries and tear them down later when the agent is disabled
 * or the store is disconnected.
 *
 * - `wcWebhookId` is the numeric id WooCommerce returns from `POST /wc/v3/webhooks`.
 *   Used to call `DELETE /wc/v3/webhooks/{id}` on teardown.
 * - `secret` is a per-user random string that WooCommerce uses to sign deliveries
 *   with HMAC-SHA256 so we can verify they came from the configured store and not
 *   a forged request. Never exposed in API responses.
 * - `deliveryUrl` is recorded so we can surface the exact endpoint in the UI / logs.
 * - `status` mirrors WooCommerce's lifecycle (`active`, `paused`, `disabled`).
 *   We default to `active` and only flip it via reconciliation.
 * - `lastEventAt` is stamped every time we receive a delivery for this subscription;
 *   helps diagnose silent webhook delivery failures.
 */
export const wooCommerceWebhookSubscriptions = pgTable('woocommerce_webhook_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  topic: varchar('topic', { length: 100 }).notNull(),
  wcWebhookId: integer('wc_webhook_id').notNull(),
  secret: text('secret').notNull(),
  deliveryUrl: text('delivery_url').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
  lastEventAt: timestamp('last_event_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type WooCommerceWebhookSubscriptionEntity = InferSelectModel<
  typeof wooCommerceWebhookSubscriptions
>;
