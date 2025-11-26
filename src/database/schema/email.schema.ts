import { pgTable, uuid, text, timestamp, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core';

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

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('emails_message_id_idx').on(t.messageId)],
);
