import { InferSelectModel } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { approvalQueue } from './approval_queue.schema';
import { escalations } from './escalation.schema';

export const approvalQueueActions = pgTable('approval_queue_actions', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Reference to parent approval queue item (workflow)
  approvalQueueId: uuid('approval_queue_id')
    .notNull()
    .references(() => approvalQueue.id, { onDelete: 'cascade' }),

  // Action-specific fields
  actionType: varchar('action_type', { length: 100 }).notNull(), // MARK_EMAIL_READ, EXTRACT_ORDER, etc.
  actionStep: varchar('action_step', { length: 10 }).notNull(), // Sequential step number (1, 2, 3, 3.1, 3.2...)
  actionStatus: varchar('action_status', { length: 50 }).notNull(), // pending_approval, approved, executing, executed, failed, escalated, rejected

  // Human-readable action name (e.g., "Mark Email as Read")
  name: varchar('name', { length: 255 }),

  // Action description/details
  description: text('description').notNull(),

  // Comprehensive details about the action for UI display (input/output summary)
  actionDetails: text('action_details'),

  // Proposed email body for actions that send AI-generated emails
  proposedEmailBody: text('proposed_email_body'),

  // Action metadata (order details, tracking info, etc.)
  metadata: jsonb('metadata'),

  // Approval tracking
  autoApproved: boolean('auto_approved').default(false).notNull(), // True if moderation disabled
  reviewedBy: uuid('reviewed_by'), // User who reviewed this action
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewNotes: text('review_notes'),

  // Execution tracking
  executedAt: timestamp('executed_at', { withTimezone: true }),
  executionResult: jsonb('execution_result'),
  executionError: jsonb('execution_error'), // Error details if action failed

  // Escalation tracking
  escalatedDuringExecution: boolean('escalated_during_execution').default(false).notNull(),
  escalationId: uuid('escalation_id').references(() => escalations.id),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ApprovalQueueActionEntity = InferSelectModel<typeof approvalQueueActions>;
