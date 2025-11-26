import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const emailThreads = pgTable(
  'email_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    threadId: text('thread_id').notNull(),
    userId: uuid('user_id').notNull(),
    subject: text('subject'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('email_threads_thread_id_idx').on(t.threadId)],
);
