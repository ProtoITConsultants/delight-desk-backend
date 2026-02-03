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

  // AI Agent Identity Fields
  aiAgentName: text('ai_agent_name').notNull(), // e.g., "Sarah", "Alex"
  businessType: text('business_type'), // e.g., "E-commerce", "SaaS"
  aiAgentTitle: text('ai_agent_title'), // e.g., "Customer Support Specialist"
  emailSalutation: text('email_salutation').notNull().default('Hi'), // e.g., "Hi", "Hello", "Dear"

  // Email Signature Fields
  companyNameForEmailSignature: text('company_name_for_email_signature'), // e.g., "Acme Corp"
  signatureFooter: text('signature_footer'), // Custom footer text

  // Voice & Settings Fields
  brandVoice: text('brand_voice').default('professional'), // 'friendly' | 'professional' | 'sophisticated' | 'custom'
  customBrandVoice: text('custom_brand_voice'), // Custom brand voice description (used when brandVoice = 'custom')
  industrySpecificGuidance: boolean('industry_specific_guidance').default(false).notNull(),
  thankLoyalCustomers: boolean('thank_loyal_customers').default(false).notNull(),
  allowEmojiInResponses: boolean('allow_emoji_in_responses').default(false).notNull(),
  customInstructions: text('custom_instructions'), // Custom AI guidelines

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AiIdentityEntity = InferSelectModel<typeof aiIdentity>;
