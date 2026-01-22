ALTER TABLE "escalations" ADD COLUMN "ai_suggested_response_confidence" text;--> statement-breakpoint
ALTER TABLE "escalations" ADD COLUMN "priority" varchar;--> statement-breakpoint
ALTER TABLE "escalations" DROP COLUMN "metadata";