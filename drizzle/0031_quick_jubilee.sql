CREATE TABLE "approval_queue_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_queue_id" uuid NOT NULL,
	"action_type" varchar(100) NOT NULL,
	"action_step" integer NOT NULL,
	"action_status" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"executed_at" timestamp with time zone,
	"execution_result" jsonb,
	"execution_error" jsonb,
	"escalated_during_execution" boolean DEFAULT false NOT NULL,
	"escalation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_queue" DROP CONSTRAINT "approval_queue_reviewed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approval_queue" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "approval_queue_actions" ADD CONSTRAINT "approval_queue_actions_approval_queue_id_approval_queue_id_fk" FOREIGN KEY ("approval_queue_id") REFERENCES "public"."approval_queue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_queue_actions" ADD CONSTRAINT "approval_queue_actions_escalation_id_escalations_id_fk" FOREIGN KEY ("escalation_id") REFERENCES "public"."escalations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "action_type";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "action_step";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "action_status";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "parent_workflow_id";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "previous_action_id";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "auto_approved";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "escalated_during_execution";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "execution_error";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "proposed_response";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "edited_response";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "reviewed_by";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "reviewed_at";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "rejection_reason";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "review_notes";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "executed_at";--> statement-breakpoint
ALTER TABLE "approval_queue" DROP COLUMN "execution_result";--> statement-breakpoint
ALTER TABLE "approval_queue" ADD CONSTRAINT "approval_queue_workflow_id_unique" UNIQUE("workflow_id");