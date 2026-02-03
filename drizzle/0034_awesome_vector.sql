ALTER TABLE "ai_identity" ADD COLUMN "brand_voice" text DEFAULT 'professional';--> statement-breakpoint
ALTER TABLE "ai_identity" ADD COLUMN "custom_brand_voice" text;--> statement-breakpoint
ALTER TABLE "ai_identity" ADD COLUMN "industry_specific_guidance" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_identity" ADD COLUMN "thank_loyal_customers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_identity" ADD COLUMN "allow_emoji_in_responses" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_identity" ADD COLUMN "custom_instructions" text;