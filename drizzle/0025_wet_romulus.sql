ALTER TABLE "escalations" ADD COLUMN "email" jsonb;--> statement-breakpoint
ALTER TABLE "escalations" ADD COLUMN "ai_suggested_response" text;