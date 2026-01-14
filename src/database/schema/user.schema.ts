import { boolean, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  password: text('password').notNull(),
  email: text('email').notNull().unique(),
  role: varchar('role', { length: 20 }).default('user'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  company: text('company'),
  phone: text('phone'),
  isActive: boolean('is_active').default(true).notNull(),
  lastLoginAt: timestamp('last_login_at'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  passwordResetToken: varchar('password_reset_token', { length: 64 }),
  passwordResetExpiresAt: timestamp('password_reset_expires_at'),
  signatureName: text('signature_name'),
  signatureTitle: text('signature_title'),
  signatureCompany: text('signature_company'),
  signatureCompanyUrl: text('signature_company_url'),
  signaturePhone: text('signature_phone'),
  signatureEmail: text('signature_email'),
  signatureLogoUrl: text('signature_logo_url'),
  signaturePhotoUrl: text('signature_photo_url'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
