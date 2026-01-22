import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const aiAssistantEmailSignatures = pgTable('ai_assistant_email_signatures', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Structured signature fields
  signatureName: text('signature_name'),
  signatureTitle: text('signature_title'),
  signatureCompany: text('signature_company'),
  signatureCompanyUrl: text('signature_company_url'),
  signatureEmail: text('signature_email'),
  signaturePhoneNumber: text('signature_phone_number'),

  // HTML signature
  htmlSignature: text('html_signature'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
