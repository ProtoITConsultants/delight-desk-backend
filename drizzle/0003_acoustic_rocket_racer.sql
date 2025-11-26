ALTER TABLE "user_store_connections" ALTER COLUMN "platform" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD COLUMN "subscription_id" text;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD COLUMN "subscription_expiry" timestamp;--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD COLUMN "history_id" text;--> statement-breakpoint
ALTER TABLE "user_store_connections" DROP COLUMN "oauth_token";--> statement-breakpoint
ALTER TABLE "user_store_connections" DROP COLUMN "oauth_token_secret";--> statement-breakpoint
ALTER TABLE "user_store_connections" DROP COLUMN "oauth_verifier";--> statement-breakpoint
ALTER TABLE "user_oauth_accounts" ADD CONSTRAINT "user_oauth_accounts_subscription_id_unique" UNIQUE("subscription_id");