import { condition, log, patched, proxyActivities } from '@temporalio/workflow';

import type { ApprovalQueueActivities } from '../activities/shared/approval-queue.activities';
import type { EscalationActivities } from '../activities/shared/escalation.activities';

import {
  ActionConfig,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionRuntimeControl,
  ActionStatus,
  CreateActionData,
  CreateApprovalQueueData,
  EscalationDetails,
  EscalationError,
  EscalationType,
  HumanDecision,
  HumanResponse,
  WorkflowActionType,
} from './types';

/**
 * Maps action type values to human-readable display names.
 * The oc_ prefix is stripped and snake_case is converted to Title Case as a fallback.
 */
const ACTION_NAME_MAP: Record<string, string> = {
  mark_email_read: 'Mark Email as Read',
  oc_mark_email_read: 'Mark Email as Read',
  verify_ai_confidence: 'Verify AI Classification',
  oc_verify_ai_confidence: 'Verify AI Classification',
  detect_customer_distress: 'Detect Customer Distress',
  extract_order_number: 'Extract Order Number',
  oc_extract_order_number: 'Extract Order Number',
  request_order_info: 'Request Order Information',
  oc_request_order_info: 'Request Order Information',
  fetch_order_details: 'Fetch Order Details',
  oc_fetch_order_details: 'Fetch Order Details',
  send_acknowledgement: 'Send Acknowledgement',
  oc_send_acknowledgement: 'Send Acknowledgement',
  wait_for_tracking: 'Wait for Tracking Number',
  create_aftership_tracking: 'Create AfterShip Tracking',
  monitor_tracking_status: 'Monitor Tracking Status',
  send_tracking_update: 'Send Tracking Update',
  send_final_notification: 'Send Final Notification',
  oc_send_final_notification: 'Send Final Notification',
  wait_for_customer_reply: 'Wait for Customer Reply',
  oc_validate_order_status: 'Validate Order Status',
  oc_check_duplicate: 'Check Duplicate Request',
  oc_check_rate_limit: 'Check Rate Limit',
  oc_record_request: 'Record Cancellation Request',
  oc_check_time_eligibility: 'Check Cancellation Eligibility',
  oc_validate_customer_email: 'Validate Customer Email',
  oc_process_cancellation: 'Process Order Cancellation',
  oc_process_refund: 'Process Refund',
  oc_contact_warehouse: 'Contact Warehouse',
  oc_wait_for_warehouse_reply: 'Wait for Warehouse Reply',
  extract_address_details: 'Extract Address Details',
  contact_warehouse: 'Contact Warehouse',
  wait_for_warehouse_reply: 'Wait for Warehouse Reply',
  process_address_change: 'Process Address Change',
};

function getActionName(type: WorkflowActionType): string {
  const mapped = ACTION_NAME_MAP[type as string];
  if (mapped) return mapped;
  // Fallback: strip oc_ prefix and convert snake_case to Title Case
  return (type as string)
    .replace(/^oc_/, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Proxy approval queue activities
const approvalQueueActivities = proxyActivities<typeof ApprovalQueueActivities.prototype>({
  startToCloseTimeout: '1 minute',
  retry: {
    initialInterval: '5s',
    maximumAttempts: 3,
  },
});

// Proxy escalation activities
const escalationActivities = proxyActivities<typeof EscalationActivities.prototype>({
  startToCloseTimeout: '3 minutes',
  retry: {
    initialInterval: '10s',
    maximumAttempts: 3,
  },
});

// Destructure activities for easier use
const {
  createApprovalQueueItem,
  findApprovalQueueByWorkflowId,
  createApprovalQueueAction,
  updateApprovalQueueAction,
  updateApprovalQueueStatus,
  markActionAsExecuted,
  markActionAsEscalated,
} = approvalQueueActivities;

const { createEscalation, generateEscalationResponse } = escalationActivities;

interface WorkflowActionRecord {
  id: string;
}

async function ensureApprovalQueueExists(
  context: ActionExecutionContext,
  actionConfig: ActionConfig,
): Promise<void> {
  if (context.approvalQueueId) {
    return;
  }

  const existingQueue = await findApprovalQueueByWorkflowId(context.workflowId, context.userId);
  if (existingQueue) {
    context.approvalQueueId = existingQueue.id;
    context.state.approvalQueueId = existingQueue.id;
    log.info('Using existing approval queue', { approvalQueueId: existingQueue.id });
    return;
  }

  const approvalQueueData: CreateApprovalQueueData = {
    userId: context.userId,
    emailId: context.email.id,
    threadId: context.email.threadId,
    workflowId: context.workflowId,
    workflowRunId: context.workflowRunId,
    agentName: context.agentType,
    customerEmail: context.email.fromEmail,
    customerName: extractCustomerName(context.email.fromEmail),
    emailSubject: context.email.subject || 'No Subject',
    emailBody: context.email.body,
    emailDate: context.email.internalDate?.toString() || new Date().toString(),
    category: context.state.classification?.category,
    confidence: context.state.classification?.confidence?.toString(),
    priority: context.state.classification?.priority,
    sentiment: context.state.classification?.sentiment,
    workflowMetadata: {
      currentStatus: context.state.status,
      ...actionConfig.metadata,
    },
  };

  const approvalQueue = await createApprovalQueueItem(approvalQueueData);
  context.approvalQueueId = approvalQueue.id;
  context.state.approvalQueueId = approvalQueue.id;

  log.info('Approval queue created for workflow', {
    approvalQueueId: approvalQueue.id,
    workflowId: context.workflowId,
  });
}

async function createAndInitializeAction(
  actionConfig: ActionConfig,
  context: ActionExecutionContext,
): Promise<WorkflowActionRecord> {
  const actionData: CreateActionData = {
    approvalQueueId: context.approvalQueueId!,
    actionType: actionConfig.type,
    actionStep: String(actionConfig.step), // Convert to string to support sub-steps like "3.1"
    actionStatus: context.requiresModeration
      ? ActionStatus.PENDING_APPROVAL
      : ActionStatus.APPROVED,
    description: actionConfig.description,
    name: actionConfig.name ?? getActionName(actionConfig.type),
    actionDetails: actionConfig.actionDetails,
    proposedEmailBody: actionConfig.proposedEmailBody,
  };

  const action = await createApprovalQueueAction(actionData);

  log.info('Action record created', {
    actionId: action.id,
    actionType: actionConfig.type,
  });

  if (actionConfig.step === 1) {
    await updateApprovalQueueStatus(context.approvalQueueId!, context.userId, 'in_progress');
    log.info('Workflow marked as in_progress');
  }

  return action;
}

function getHumanResponseForAction(
  actionId: string,
  context: ActionExecutionContext,
  humanResponseGetter?: () => HumanResponse | null,
): HumanResponse | null | undefined {
  if (humanResponseGetter) {
    return humanResponseGetter();
  }
  return context.state.actionResponses?.[actionId];
}

async function awaitHumanModeration(
  action: WorkflowActionRecord,
  actionConfig: ActionConfig,
  context: ActionExecutionContext,
  humanResponseGetter?: () => HumanResponse | null,
): Promise<ActionExecutionResult | null> {
  if (!context.requiresModeration) {
    return null;
  }

  log.info('Waiting for human approval', {
    actionId: action.id,
    actionType: actionConfig.type,
    step: actionConfig.step,
  });

  try {
    const receivedResponse = await condition(() => {
      const response = getHumanResponseForAction(action.id, context, humanResponseGetter);
      return response !== null && response !== undefined;
    }, '7 days');

    const humanResponse = getHumanResponseForAction(action.id, context, humanResponseGetter);

    if (!receivedResponse || !humanResponse || humanResponse.decision === HumanDecision.REJECT) {
      await updateApprovalQueueAction(action.id, {
        actionStatus: ActionStatus.REJECTED,
      });

      log.warn('Action rejected or timed out', {
        actionId: action.id,
        actionType: actionConfig.type,
        decision: humanResponse?.decision || 'TIMEOUT',
      });

      return {
        success: false,
        actionId: action.id,
      };
    }

    log.info('Action approved by human', {
      actionId: action.id,
      actionType: actionConfig.type,
      decision: humanResponse.decision,
      respondedBy: humanResponse.respondedBy,
    });

    await updateApprovalQueueAction(action.id, {
      actionStatus: ActionStatus.APPROVED,
    });

    if (humanResponse.modifiedData) {
      log.info('Human provided modified data', {
        actionId: action.id,
        hasModifiedData: true,
      });
    }

    return null;
  } catch (error) {
    log.error('Error waiting for approval', {
      error,
      actionId: action.id,
      actionType: actionConfig.type,
    });

    await updateApprovalQueueAction(action.id, {
      actionStatus: ActionStatus.FAILED,
    });

    return {
      success: false,
      actionId: action.id,
    };
  }
}

function createRuntimeControl(actionId: string): ActionRuntimeControl {
  return {
    setStatus: async (status, additionalData = {}) => {
      await updateApprovalQueueAction(actionId, {
        actionStatus: status,
        ...additionalData,
      });
    },
  };
}

/**
 * Main function to execute a workflow action with approval and escalation handling
 *
 * This function:
 * 1. Creates approval queue item once per workflow (on first action)
 * 2. Creates an action record for this specific action
 * 3. Waits for human approval if moderation is enabled
 * 4. Executes the action
 * 5. Handles escalations if the action fails
 * 6. Updates workflow status based on outcomes
 * 7. Marks the action as executed
 *
 * @param actionConfig Configuration for the action
 * @param actionExecutor Function that executes the actual action logic
 * @param context Execution context including workflow and user info
 * @param humanResponseGetter Optional function to get human response (for testing)
 * @returns Result of the action execution
 */
export async function executeWorkflowAction<T>(
  actionConfig: ActionConfig,
  actionExecutor: (
    humanResponse?: HumanResponse | null,
    runtimeControl?: ActionRuntimeControl,
  ) => Promise<T>,
  context: ActionExecutionContext,
  humanResponseGetter?: () => HumanResponse | null,
): Promise<ActionExecutionResult<T>> {
  log.info('Starting workflow action execution', {
    actionType: actionConfig.type,
    step: actionConfig.step,
    requiresModeration: context.requiresModeration,
  });

  await ensureApprovalQueueExists(context, actionConfig);
  const action = await createAndInitializeAction(actionConfig, context);

  const moderationResult = await awaitHumanModeration(
    action,
    actionConfig,
    context,
    humanResponseGetter,
  );
  if (moderationResult) {
    return moderationResult;
  }

  // 5. Update action status to executing
  await updateApprovalQueueAction(action.id, {
    actionStatus: ActionStatus.EXECUTING,
  });

  log.info('Executing action', {
    actionId: action.id,
    actionType: actionConfig.type,
    step: actionConfig.step,
  });

  const runtimeControl = createRuntimeControl(action.id);

  // 6. Execute the actual action
  // Pass the action's human response so email executors can use modifiedData.message
  const humanActionResponse = context.state.actionResponses?.[action.id];
  if (context.state.actionResponses?.[action.id]) {
    delete context.state.actionResponses[action.id];
  }

  try {
    const result = await actionExecutor(humanActionResponse, runtimeControl);

    // 7. Mark action as successfully executed
    // Guard with Temporal patching to keep replay deterministic for
    // workflow histories started before this activity call existed.
    if (patched('mark-action-as-executed-v1')) {
      await markActionAsExecuted(action.id);
    }

    log.info('Action executed successfully', {
      actionId: action.id,
      actionType: actionConfig.type,
      step: actionConfig.step,
    });

    return {
      success: true,
      result,
      actionId: action.id,
    };
  } catch (error) {
    // 8. Handle escalation during execution
    log.error('Action failed during execution', {
      error,
      actionId: action.id,
      actionType: actionConfig.type,
      step: actionConfig.step,
    });

    // Create escalation record
    const escalation = await createEscalationFromError(error, context, actionConfig);

    // Mark action as escalated
    await markActionAsEscalated(action.id, escalation.id, escalation.reason);

    // Mark workflow as escalated
    await updateApprovalQueueStatus(
      context.approvalQueueId!,
      context.userId,
      'escalated',
      escalation.id,
    );

    log.info('Workflow marked as escalated', {
      approvalQueueId: context.approvalQueueId,
      escalationId: escalation.id,
    });

    return {
      success: false,
      escalation,
      actionId: action.id,
    };
  }
}

/**
 * Create an escalation record from an error
 * Generates AI response and handles both EscalationError and generic errors
 */
async function createEscalationFromError(
  error: any,
  context: ActionExecutionContext,
  actionConfig: ActionConfig,
): Promise<EscalationDetails> {
  let escalationType: EscalationType;
  let escalationReason: string;
  let metadata: Record<string, any> = {};

  // Determine escalation type and reason
  if (error instanceof EscalationError) {
    escalationType = error.type;
    escalationReason = error.reason;
    metadata = error.metadata || {};
  } else {
    escalationType = EscalationType.MANUAL_ESCALATION;
    escalationReason = `Unexpected error during ${actionConfig.description}: ${error instanceof Error ? error.message : String(error)}`;
  }

  // Add action context to metadata
  metadata.action = actionConfig.type;
  metadata.step = actionConfig.step;
  metadata.actionDescription = actionConfig.description;
  metadata.workflowState = context.state.status;

  // Extract customer name
  const customerName = extractCustomerName(context.email.fromEmail);

  // Generate AI response for the escalation
  const { response: aiResponse, confidence: aiConfidence } = await generateEscalationResponse(
    escalationType,
    context.email.body,
    customerName,
    actionConfig.metadata?.orderNumber,
    metadata,
  );

  // Create escalation record
  const escalation = await createEscalation({
    workflowId: context.workflowId,
    threadId: context.email.threadId,
    userId: context.userId,
    reason: escalationReason,
    email: context.email,
    aiSuggestedResponse: aiResponse,
    aiSuggestedResponseConfidence: aiConfidence?.toString(),
    priority: context.state.classification?.priority,
  });

  log.info('Escalation created', {
    escalationId: escalation.id,
    type: escalationType,
    reason: escalationReason,
  });

  return {
    id: escalation.id,
    type: escalationType,
    reason: escalationReason,
    aiSuggestedResponse: aiResponse,
    aiSuggestedResponseConfidence: aiConfidence?.toString(),
    metadata,
  };
}

/**
 * Extract customer name from email address.
 * Prefers the display name ("John Doe <john@example.com>" → "John Doe").
 * Strips RFC-822 surrounding quotes ('"John Doe" <...>' → "John Doe").
 * Falls back to the email local-part ("john@example.com" → "john").
 */
export function extractCustomerName(fromEmail: string): string {
  const match = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    // Remove surrounding double or single quotes that some mail clients add
    return match[1].trim().replace(/^["']|["']$/g, '');
  }

  const emailMatch = fromEmail.match(/([^@<]+)[@<]/);
  if (emailMatch) {
    return emailMatch[1].trim();
  }

  return 'Customer';
}

/**
 * Mark an approval queue as completed.
 * Reuses the already-proxied ApprovalQueueActivities so callers don't
 * need to create their own proxyActivities instance.
 */
export async function markApprovalQueueCompleted(
  approvalQueueId: string,
  userId: string,
): Promise<void> {
  await updateApprovalQueueStatus(approvalQueueId, userId, 'completed');
  log.info('Approval queue marked as completed', { approvalQueueId });
}
