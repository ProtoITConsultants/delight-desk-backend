ALTER TABLE "emails" ALTER COLUMN "from_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "to_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ALTER COLUMN "body" SET NOT NULL;