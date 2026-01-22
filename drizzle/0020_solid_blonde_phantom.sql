CREATE TABLE "approval_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"email_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"workflow_id" varchar(255) NOT NULL,
	"workflow_run_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"customer_email" text NOT NULL,
	"customer_name" text,
	"email_subject" text NOT NULL,
	"email_body" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"confidence" varchar(10),
	"priority" varchar(20) NOT NULL,
	"sentiment" varchar(20),
	"proposed_response" text NOT NULL,
	"edited_response" text,
	"workflow_metadata" jsonb,
	"planned_steps" jsonb,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"review_notes" text,
	"executed_at" timestamp with time zone,
	"execution_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_queue_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_queue_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_queue" ADD CONSTRAINT "approval_queue_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;