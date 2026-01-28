ALTER TABLE "approval_queue" ADD COLUMN "action_type" varchar(100);--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "action_step" integer;--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "action_status" varchar(50);--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "parent_workflow_id" varchar(255);--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "previous_action_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "auto_approved" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "escalated_during_execution" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "escalation_id" uuid;--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "execution_error" jsonb;--> statement-breakpoint
ALTER TABLE "approval_queue" ADD CONSTRAINT "approval_queue_escalation_id_escalations_id_fk" FOREIGN KEY ("escalation_id") REFERENCES "public"."escalations"("id") ON DELETE no action ON UPDATE no action;