import { jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const escalations = pgTable('escalations', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: varchar('workflow_id').notNull(),
  threadId: uuid('thread_id').notNull(),
  userId: uuid('user_id').notNull(),

  // 'pending' | 'progress' | 'resolved' |
  status: varchar('status', { length: 20 }).default('pending').notNull(),

  reason: text('reason').notNull(),
  email: jsonb('email'),
  aiSuggestedResponse: text('ai_suggested_response'),
  aiSuggestedResponseConfidence: text('ai_suggested_response_confidence'),
  priority: varchar('priority'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true, mode: 'date' }),
});
