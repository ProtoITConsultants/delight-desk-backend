ALTER TABLE "system_settings" ADD COLUMN "fulfillment_method" text DEFAULT 'self' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "warehouse_email" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "shipbob_api_key" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "shipbob_channel_id" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "shipstation_api_key" text;