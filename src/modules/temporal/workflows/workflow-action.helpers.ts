import { condition, log, proxyActivities } from '@temporalio/workflow';

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
  UpdateActionData,
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

  // 1. Check if approval queue exists for this workflow, create if not (first action only)
  if (!context.approvalQueueId) {
    const existingQueue = await findApprovalQueueByWorkflowId(context.workflowId, context.userId);

    if (existingQueue) {
      context.approvalQueueId = existingQueue.id;
      context.state.approvalQueueId = existingQueue.id;
      log.info('Using existing approval queue', { approvalQueueId: existingQueue.id });
    } else {
      // Create approval queue item (workflow-level) - only once
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
  }

  // 2. Create action record for this specific action
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
    metadata: {
      ...actionConfig.metadata,
      currentWorkflowStatus: context.state.status,
    },
    autoApproved: !context.requiresModeration,
  };

  const action = await createApprovalQueueAction(actionData);

  log.info('Action record created', {
    actionId: action.id,
    actionType: actionConfig.type,
    autoApproved: !context.requiresModeration,
  });

  // 3. Update workflow status to in_progress (if first action)
  if (actionConfig.step === 1) {
    await updateApprovalQueueStatus(context.approvalQueueId!, context.userId, 'in_progress');
    log.info('Workflow marked as in_progress');
  }

  // 4. If moderation required, wait for approval
  if (context.requiresModeration) {
    log.info('Waiting for human approval', {
      actionId: action.id,
      actionType: actionConfig.type,
      step: actionConfig.step,
    });

    try {
      // Wait for approval signal with timeout (7 days)
      // Read from workflow state (Temporal-safe!) instead of in-memory Map
      const receivedResponse = await condition(() => {
        if (humanResponseGetter) {
          const response = humanResponseGetter();
          return response !== null;
        }
        // Read from workflow state using action ID
        const response = context.state.actionResponses?.[action.id];
        return response !== undefined;
      }, '7 days');

      const humanResponse = humanResponseGetter
        ? humanResponseGetter()
        : context.state.actionResponses?.[action.id];

      if (!receivedResponse || !humanResponse || humanResponse.decision === HumanDecision.REJECT) {
        // Action was rejected or timed out
        const updateData: UpdateActionData = {
          actionStatus: ActionStatus.REJECTED,
          reviewedAt: new Date(),
        };
        await updateApprovalQueueAction(action.id, updateData);

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

      // Update action with review info
      await updateApprovalQueueAction(action.id, {
        actionStatus: ActionStatus.APPROVED,
        reviewedBy: humanResponse.respondedBy,
        reviewedAt: humanResponse.respondedAt,
      });

      // If user modified the data, we might need to use it in the executor
      // For now, we'll just log it - specific actions can access it via context
      if (humanResponse.modifiedData) {
        log.info('Human provided modified data', {
          actionId: action.id,
          hasModifiedData: true,
        });
      }
    } catch (error) {
      log.error('Error waiting for approval', {
        error,
        actionId: action.id,
        actionType: actionConfig.type,
      });

      await updateApprovalQueueAction(action.id, {
        actionStatus: ActionStatus.FAILED,
        executionError: {
          message: 'Failed to receive approval',
          error: error instanceof Error ? error.message : String(error),
        },
      });

      return {
        success: false,
        actionId: action.id,
      };
    }
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

  const runtimeControl: ActionRuntimeControl = {
    setStatus: async (status, additionalData = {}) => {
      await updateApprovalQueueAction(action.id, {
        actionStatus: status,
        ...additionalData,
      });
    },
  };

  // 6. Execute the actual action
  // Pass the action's human response so email executors can use modifiedData.message
  const humanActionResponse = context.state.actionResponses?.[action.id];
  try {
    const result = await actionExecutor(humanActionResponse, runtimeControl);

    // 7. Mark action as successfully executed
    await markActionAsExecuted(action.id, {
      success: true,
      result,
      executedAt: new Date(),
      actionType: actionConfig.type,
      step: actionConfig.step,
    });

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
    await markActionAsEscalated(action.id, escalation.id, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: error instanceof EscalationError ? error.type : EscalationType.MANUAL_ESCALATION,
    });

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
  const {
    response: aiResponse,
    confidence: aiConfidence,
    reason: aiReason,
  } = await generateEscalationResponse(
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
    reason: aiReason || escalationReason,
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
    reason: aiReason || escalationReason,
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
