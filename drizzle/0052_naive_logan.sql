ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "promo_code_application_guidance" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN IF NOT EXISTS "promo_code_existing_customer_denial_note" text;--> statement-breakpoint
ALTER TABLE "promo_code_configurations" ADD COLUMN IF NOT EXISTS "woocommerce_coupon_id" integer;--> statement-breakpoint
ALTER TABLE "promo_code_configurations" ADD COLUMN IF NOT EXISTS "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "promo_code_configurations" ADD COLUMN IF NOT EXISTS "last_sync_error" text;
