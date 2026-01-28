import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const apiRateLimits = pgTable(
  'api_rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    endpoint: varchar('endpoint', { length: 100 }).notNull(),
    callCount: integer('call_count').notNull().default(0),
    limitCount: integer('limit_count').notNull().default(5),
    resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('api_rate_limits_user_endpoint_idx').on(t.userId, t.endpoint, t.resetAt)],
);

export type ApiRateLimitEntity = InferSelectModel<typeof apiRateLimits>;
