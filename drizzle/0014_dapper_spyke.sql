CREATE TABLE "agent_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"date" timestamp NOT NULL,
	"total_processed" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"escalation_count" integer DEFAULT 0 NOT NULL,
	"approval_count" integer DEFAULT 0 NOT NULL,
	"total_response_time" integer DEFAULT 0 NOT NULL,
	"avg_response_time" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalation_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_type" varchar(50) NOT NULL,
	"reason" text NOT NULL,
	"metadata" jsonb,
	"resolved_by" uuid,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" varchar(100) NOT NULL,
	"email_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(20) NOT NULL,
	"total_steps" integer,
	"failed_steps" integer,
	"total_duration" integer,
	"error" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "execution_summaries_execution_id_unique" UNIQUE("execution_id")
);
--> statement-breakpoint
CREATE TABLE "pipeline_execution_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" varchar(100) NOT NULL,
	"email_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"step" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"duration" integer,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_execution_logs_execution_id_unique" UNIQUE("execution_id")
);
--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "execution_id" varchar(100);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "status" varchar(20) DEFAULT 'processing';--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "confidence" integer;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "category" varchar(50);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "priority" varchar(20);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "agent_type" varchar(50);--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "response" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "rejected_at" timestamp;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "edited_by" uuid;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "escalated_at" timestamp;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "escalation_reason" text;