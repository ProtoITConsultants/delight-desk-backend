/**
 * Centralized signal names shared by Temporal workflows and InfraService.
 * Keep values stable to preserve wire compatibility with running workflows.
 */
export const WORKFLOW_SIGNAL_NAMES = {
  THREAD_MESSAGE: 'threadMessage',
  HUMAN_RESPONSE: 'humanResponse',
  CUSTOMER_REPLY: 'customerReply',
  WAREHOUSE_REPLY: 'warehouseReply',
} as const;

