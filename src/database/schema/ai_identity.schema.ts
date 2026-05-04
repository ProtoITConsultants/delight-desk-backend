import { InferSelectModel } from 'drizzle-orm';
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const aiIdentity = pgTable('ai_identity', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Reference to user
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),

  // AI Agent Identity Fields. The previous `businessType` column was removed once
  // the only feature reading it (`industrySpecificGuidance`) was retired.
  aiAgentName: text('ai_agent_name'), // e.g., "Sarah", "Alex"
  aiAgentTitle: text('ai_agent_title'), // e.g., "Customer Support Specialist"
  emailSalutation: text('email_salutation').default('Hi'), // e.g., "Hi", "Hello", "Dear"

  // Email Signature Fields
  companyNameForEmailSignature: text('company_name_for_email_signature'), // e.g., "Acme Corp"
  signatureFooter: text('signature_footer'), // Custom footer text

  // Voice & Settings Fields. brandVoice is one of three preset values which the
  // message formatter uses to steer reply phrasing. The previous `customBrandVoice`
  // (free-text override for brandVoice='custom') and `industrySpecificGuidance`
  // (boolean toggle that injected business-type best practices) columns were removed
  // to keep the option set small and the AI's behavior predictable.
  brandVoice: text('brand_voice').default('professional'), // 'friendly' | 'professional' | 'sophisticated'
  thankLoyalCustomers: boolean('thank_loyal_customers').default(false).notNull(),
  allowEmojiInResponses: boolean('allow_emoji_in_responses').default(false).notNull(),
  customInstructions: text('custom_instructions'), // Custom AI guidelines

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AiIdentityEntity = InferSelectModel<typeof aiIdentity>;
