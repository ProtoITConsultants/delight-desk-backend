export const APPROVAL_QUEUE_WORKFLOW_STATUSES = [
  'pending',
  'in_progress',
  'cancelled',
  'escalated',
  'completed',
] as const;

/** Action status when a step is waiting for human approve/reject. */
export const PENDING_APPROVAL_ACTION_STATUS = 'pending_approval' as const;

/**
 * Query `status` values accepted by GET /approval-queue.
 * Includes workflow statuses plus `pending_approval`, which filters items that
 * have at least one action in `pending_approval` (not the workflow-level `pending` status).
 */
export const APPROVAL_QUEUE_FILTER_STATUSES = [
  ...APPROVAL_QUEUE_WORKFLOW_STATUSES,
  PENDING_APPROVAL_ACTION_STATUS,
] as const;

export type ApprovalQueueWorkflowStatus = (typeof APPROVAL_QUEUE_WORKFLOW_STATUSES)[number];
export type ApprovalQueueFilterStatus = (typeof APPROVAL_QUEUE_FILTER_STATUSES)[number];
