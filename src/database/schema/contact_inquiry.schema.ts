import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const contactInquiries = pgTable('contact_inquiries', {
  id: uuid('id').primaryKey().defaultRandom(),

  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  inquiry: text('inquiry').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
