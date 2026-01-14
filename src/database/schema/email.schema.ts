import { InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    messageId: text('message_id').notNull(),
    threadId: uuid('thread_id').notNull(),
    userId: uuid('user_id').notNull(),

    fromEmail: text('from_email'),
    toEmail: text('to_email'),
    cc: text('cc'),

    bcc: text('bcc'),
    snippet: text('snippet'),
    subject: text('subject'),

    body: text('body'),
    internalDate: timestamp('internal_date', { mode: 'date' }),
    isRead: boolean('is_read').default(false),

    // Pipeline fields
    // status = processing, processing_awaited, processing_ai_assistant,
    // pending_approval, approval_rejected, escalated, failed, resolved, default_sent
    executionId: varchar('execution_id', { length: 100 }),
    status: varchar('status', { length: 20 }).default('processing'),
    confidence: integer('confidence'), // 0-100

    category: varchar('category', { length: 50 }), // order_status, refund, etc
    priority: varchar('priority', { length: 20 }), // low, medium, high, urgent
    agentType: varchar('agent_type', { length: 50 }),

    response: text('response'),
    metadata: jsonb('metadata'),
    approvedBy: uuid('approved_by'),

    approvedAt: timestamp('approved_at'),
    rejectedBy: uuid('rejected_by'),
    rejectedAt: timestamp('rejected_at'),

    rejectionReason: text('rejection_reason'),
    editedBy: uuid('edited_by'),
    resolvedAt: timestamp('resolved_at'),

    escalatedAt: timestamp('escalated_at'),
    escalationReason: text('escalation_reason'),
    direction: varchar('direction', { length: 10 }).$type<'incoming' | 'outgoing'>(),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('emails_message_id_idx').on(t.messageId)],
);

export type EmailEntity = InferSelectModel<typeof emails>;
