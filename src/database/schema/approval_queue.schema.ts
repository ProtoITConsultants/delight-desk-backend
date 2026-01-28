import { InferSelectModel } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { escalations } from './escalation.schema';

export const approvalQueue = pgTable('approval_queue', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id').notNull(),

  emailId: uuid('email_id').notNull(),

  threadId: uuid('thread_id').notNull(),

  workflowId: varchar('workflow_id', { length: 255 }).notNull().unique(),
  workflowRunId: varchar('workflow_run_id', { length: 255 }).notNull(),

  // Workflow status: pending (no actions executed), in_progress (first action started), completed (all actions done), escalated (any action failed)
  status: varchar('status', { length: 50 }).default('pending').notNull(),

  // wismo, refund, subscription, etc.
  agentType: varchar('agent_type', { length: 50 }).notNull(),

  // Email context
  customerEmail: text('customer_email').notNull(),
  customerName: text('customer_name'),
  emailSubject: text('email_subject').notNull(),
  emailBody: text('email_body').notNull(),
  emailDate: text('email_date'),

  // AI Classification
  category: varchar('category', { length: 50 }),
  confidence: varchar('confidence', { length: 10 }),
  priority: varchar('priority', { length: 20 }), // low, medium, high, urgent
  sentiment: varchar('sentiment', { length: 20 }), // positive, neutral, negative

  // Workflow metadata
  workflowMetadata: jsonb('workflow_metadata'), // Contains order details, tracking info, etc.
  plannedSteps: jsonb('planned_steps'), // Array of planned workflow steps

  // Escalation tracking (if workflow escalated)
  escalationId: uuid('escalation_id').references(() => escalations.id),
  escalatedAt: timestamp('escalated_at', { withTimezone: true }),

  // Completion tracking
  completedAt: timestamp('completed_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const approvalQueueActivityLog = pgTable('approval_queue_activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),

  approvalQueueId: uuid('approval_queue_id').notNull(),

  userId: uuid('user_id'),

  // created, pending_review, approved, rejected, edited, executed, failed
  action: varchar('action', { length: 50 }).notNull(),

  // Human-readable description of the action
  description: text('description').notNull(),

  // Additional metadata for the action
  metadata: jsonb('metadata'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ApprovalQueueEntity = InferSelectModel<typeof approvalQueue>;
export type ApprovalQueueActivityLogEntity = InferSelectModel<typeof approvalQueueActivityLog>;
