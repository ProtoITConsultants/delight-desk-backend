ALTER TABLE "contact_inquiries" RENAME COLUMN "company" TO "subject";--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ALTER COLUMN "expires_at" SET NOT NULL;