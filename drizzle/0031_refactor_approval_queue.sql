-- Create approval_queue_actions table
CREATE TABLE IF NOT EXISTS "approval_queue_actions" (
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

-- Add foreign key constraints for approval_queue_actions
DO $$ BEGIN
 ALTER TABLE "approval_queue_actions" ADD CONSTRAINT "approval_queue_actions_approval_queue_id_approval_queue_id_fk" FOREIGN KEY ("approval_queue_id") REFERENCES "public"."approval_queue"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "approval_queue_actions" ADD CONSTRAINT "approval_queue_actions_escalation_id_escalations_id_fk" FOREIGN KEY ("escalation_id") REFERENCES "public"."escalations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add unique constraint on approval_queue.workflow_id
DO $$ BEGIN
 ALTER TABLE "approval_queue" ADD CONSTRAINT "approval_queue_workflow_id_unique" UNIQUE("workflow_id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Add new columns to approval_queue
ALTER TABLE "approval_queue" ADD COLUMN IF NOT EXISTS "escalated_at" timestamp with time zone;
ALTER TABLE "approval_queue" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;

-- Drop old action-specific columns from approval_queue
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "action_type";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "action_step";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "action_status";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "parent_workflow_id";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "previous_action_id";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "auto_approved";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "escalated_during_execution";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "execution_error";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "proposed_response";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "edited_response";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "reviewed_by";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "reviewed_at";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "rejection_reason";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "review_notes";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "executed_at";
ALTER TABLE "approval_queue" DROP COLUMN IF EXISTS "execution_result";

-- Update status column comment to reflect new values
COMMENT ON COLUMN "approval_queue"."status" IS 'Workflow status: pending (no actions executed), in_progress (first action started), completed (all actions done), escalated (any action failed)';
