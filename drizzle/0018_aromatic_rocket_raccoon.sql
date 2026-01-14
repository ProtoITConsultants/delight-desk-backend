DROP TABLE "agent_metrics" CASCADE;--> statement-breakpoint
DROP TABLE "escalation_logs" CASCADE;--> statement-breakpoint
DROP TABLE "execution_summaries" CASCADE;--> statement-breakpoint
DROP TABLE "pipeline_execution_logs" CASCADE;--> statement-breakpoint
DROP TABLE "aftership_trackings" CASCADE;--> statement-breakpoint
ALTER TABLE "email_threads" ADD COLUMN "workflow_id" text;