import { jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const escalations = pgTable('escalations', {
  id: uuid('id').defaultRandom().primaryKey(),

  workflowId: varchar('workflow_id').notNull(),

  threadId: uuid('thread_id').notNull(),

  userId: uuid('user_id').notNull(),

  // 'open' | 'resolved' | 'rejected'
  status: varchar('status', { length: 20 }).default('open').notNull(),

  reason: text('reason').notNull(),

  metadata: jsonb('metadata'),

  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

  resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
});
