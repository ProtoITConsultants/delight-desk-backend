ALTER TABLE "user_oauth_accounts" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_email_unique" UNIQUE("email");