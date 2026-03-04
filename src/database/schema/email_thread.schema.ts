import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const emailThreads = pgTable(
  'email_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    threadId: text('thread_id').notNull(),
    userId: uuid('user_id').notNull(),
    subject: text('subject'),
    workflowId: text('workflow_id'),
    /** Email provider that originated this thread: 'google' | 'microsoft' */
    provider: text('provider').default('google'),
    /**
     * Who sent the very first email in this thread.
     * 'customer' (default) → customer-initiated; pipeline runs normally.
     * 'owner'              → agent/owner sent first; customer replies are NOT
     *                        routed through the AI pipeline.
     */
    initiatedBy: text('initiated_by').default('customer'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('email_threads_thread_id_idx').on(t.threadId)],
);
