ALTER TABLE "approval_queue_actions" ADD COLUMN "escalation_reason" text;--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "metadata";--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "auto_approved";--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "reviewed_by";--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "reviewed_at";--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "review_notes";--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "executed_at";--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "execution_result";--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "execution_error";--> statement-breakpoint
ALTER TABLE "approval_queue_actions" DROP COLUMN "escalated_during_execution";