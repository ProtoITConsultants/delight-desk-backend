export const APPROVAL_QUEUE_WORKFLOW_STATUSES = [
  'pending',
  'in_progress',
  'cancelled',
  'escalated',
  'completed',
] as const;

/** Query `status` values accepted by GET /approval-queue (includes virtual filters). */
export const APPROVAL_QUEUE_FILTER_STATUSES = [
  ...APPROVAL_QUEUE_WORKFLOW_STATUSES,
  'requires_approval',
] as const;

export type ApprovalQueueWorkflowStatus = (typeof APPROVAL_QUEUE_WORKFLOW_STATUSES)[number];
export type ApprovalQueueFilterStatus = (typeof APPROVAL_QUEUE_FILTER_STATUSES)[number];

export const REQUIRES_APPROVAL_FILTER_STATUS = 'requires_approval' as const;
export const PENDING_APPROVAL_ACTION_STATUS = 'pending_approval' as const;
