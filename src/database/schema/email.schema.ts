import { InferSelectModel } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const emails = pgTable(
  'emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(),
    threadId: uuid('thread_id').notNull(),
    userId: uuid('user_id').notNull(),
    fromEmail: text('from_email').notNull(),
    toEmail: text('to_email').notNull(),
    cc: text('cc'),
    bcc: text('bcc'),
    subject: text('subject'),
    snippet: text('snippet'),
    body: text('body').notNull(),
    internalDate: timestamp('internal_date', { mode: 'date' }),
    direction: varchar('direction', { length: 10 }).$type<'incoming' | 'outgoing'>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('emails_message_id_idx').on(t.messageId)],
);

export type EmailEntity = InferSelectModel<typeof emails>;
