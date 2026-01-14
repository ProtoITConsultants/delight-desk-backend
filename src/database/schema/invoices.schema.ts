import { decimal, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { subscriptions } from './index';

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),

  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
    onDelete: 'cascade',
  }),

  stripeInvoiceId: text('stripe_invoice_id').notNull(),
  amountDue: decimal('amount_due', { precision: 10, scale: 2 }),
  amountPaid: decimal('amount_paid', { precision: 10, scale: 2 }),
  status: text('status'), // paid | open | void | uncollectible
  currency: text('currency'),
  invoicePdfUrl: text('invoice_pdf_url'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
