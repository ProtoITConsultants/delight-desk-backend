ALTER TABLE "approval_queue_actions" ADD COLUMN "name" varchar(255);--> statement-breakpoint
ALTER TABLE "approval_queue_actions" ADD COLUMN "action_details" text;--> statement-breakpoint
ALTER TABLE "approval_queue_actions" ADD COLUMN "proposed_email_body" text;