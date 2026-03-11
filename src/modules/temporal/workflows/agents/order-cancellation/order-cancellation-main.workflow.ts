/**
 * Order Cancellation Main Workflow
 * Iteration 1 orchestrator for preparation, discovery, and processing phases
 */

import {
  defineQuery,
  defineSignal,
  log,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type { AiIdentityActivities } from '../../../activities/shared/ai-identity.activities';

import { ActionExecutionContext, HumanResponse, WorkFlowInput } from '../../types';
import { markApprovalQueueCompleted } from '../../workflow-action.helpers';
import { OrderCancellationWorkflowState } from './order-cancellation.types';
import { ACTIVITY_TIMEOUTS } from './order-cancellation.constants';
import { handleOrderCancellationPreparation } from './sub-workflows/order-cancellation-preparation.sub-workflow';
import { handleOrderCancellationOrderDiscovery } from './sub-workflows/order-cancellation-order-discovery.sub-workflow';
import { handleOrderCancellationOrderProcessing } from './sub-workflows/order-cancellation-order-processing.sub-workflow';
import { handleOrderCancellationFulfillment } from './sub-workflows/order-cancellation-fulfillment.sub-workflow';
import { EmailEntity } from '../../../../../database/schema';
import { WORKFLOW_SIGNAL_NAMES } from '../../../workflow-signals.constants';

// Proxy activities needed at main workflow level
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);

const { getUserAgentSettings } = aiIdentityActivities;

// Define signals and queries (MUST be at main workflow level)
export const humanResponseSignal = defineSignal<[HumanResponse, string?]>(
  WORKFLOW_SIGNAL_NAMES.HUMAN_RESPONSE,
);
export const stateQuery = defineQuery<OrderCancellationWorkflowState>('state');

/**
 * Signal sent by InfraService whenever a new inbound email arrives on the thread.
 * The order-discovery sub-workflow waits on this via condition() instead of polling.
 */
export const customerReplySignal = defineSignal<[EmailEntity]>(
  WORKFLOW_SIGNAL_NAMES.CUSTOMER_REPLY,
);
export const warehouseReplySignal = defineSignal<[EmailEntity]>(
  WORKFLOW_SIGNAL_NAMES.WAREHOUSE_REPLY,
);

interface PhaseExecutionResult {
  success: boolean;
  escalation?: {
    reason: string;
  };
}

async function executePhase<T extends PhaseExecutionResult>(
  label: string,
  run: () => Promise<T>,
  cancelledMessage: string,
): Promise<{ shouldExit: true; result: string } | { shouldExit: false; phaseResult: T }> {
  log.info(`Executing ${label}`);
  const phaseResult = await run();

  if (!phaseResult.success) {
    log.error(`${label} failed`, {
      escalation: phaseResult.escalation,
    });

    if (phaseResult.escalation) {
      return {
        shouldExit: true,
        result: `Escalated: ${phaseResult.escalation.reason}`,
      };
    }

    return {
      shouldExit: true,
      result: cancelledMessage,
    };
  }

  log.info(`${label} completed successfully`);
  return {
    shouldExit: false,
    phaseResult,
  };
}

/**
 * Main Order Cancellation workflow orchestrator
 * Iteration 2: runs first 3 phases + self-fulfillment cancellation flow
 */
export async function handleOrderCancellation(wfInput: WorkFlowInput): Promise<string> {
  const wfInfo = workflowInfo();
  const { email, classification } = wfInput;

  log.info('Starting Order Cancellation main workflow', {
    workflowId: wfInfo.workflowId,
    emailId: email.id,
    classification: classification.category,
    confidence: classification.confidence,
  });

  let state: OrderCancellationWorkflowState = {
    email,
    classification,
    escalation: {},
    humanResponse: {},
    actionResponses: {},
    status: 'processing',
    lastUpdated: new Date(),
  };

  // Set up signal handler to route responses to specific actions
  // CRITICAL: Must be at main workflow level (Temporal requirement)
  setHandler(humanResponseSignal, (response: HumanResponse, approvalItemId?: string) => {
    state.humanResponse = response;
    state.lastUpdated = new Date();

    // Store response for specific action in workflow state (Temporal-safe!)
    if (approvalItemId) {
      if (!state.actionResponses) {
        state.actionResponses = {};
      }
      state.actionResponses[approvalItemId] = response;

      log.info('Action response stored in workflow state', {
        approvalItemId,
        decision: response.decision,
      });
    }
  });

  // Receive the customer's reply email in real-time (sent by InfraService via webhook).
  // The order-discovery sub-workflow unblocks its condition() as soon as this fires.
  setHandler(customerReplySignal, (replyEmail: EmailEntity) => {
    state.customerReplyEmail = replyEmail;
    state.lastUpdated = new Date();
    log.info('Customer reply received via signal', { messageId: replyEmail.messageId });
  });

  // Receive warehouse replies routed by InfraService from standalone mailbox threads.
  setHandler(warehouseReplySignal, (replyEmail: EmailEntity) => {
    state.warehouseReplyEmail = replyEmail;
    state.lastUpdated = new Date();
    log.info('Warehouse reply received via signal', { messageId: replyEmail.messageId });
  });

  // Set up state query handler
  setHandler(stateQuery, () => state);

  try {
    // Get agent settings to determine if moderation is required
    const agentSettings = await getUserAgentSettings(email.userId, 'order_cancellation');

    const context: ActionExecutionContext<OrderCancellationWorkflowState> = {
      workflowId: wfInfo.workflowId,
      workflowRunId: wfInfo.runId,
      userId: email.userId,
      email,
      state,
      requiresModeration: agentSettings.requiresModeration || false,
      agentType: 'Order Cancellation Agent',
    };

    log.info('Workflow context initialized', {
      requiresModeration: context.requiresModeration,
    });

    const preparationPhase = await executePhase(
      'Phase 1: Preparation',
      () => handleOrderCancellationPreparation(context),
      'Workflow cancelled during preparation phase',
    );
    if (preparationPhase.shouldExit) return preparationPhase.result;
    log.info('Phase 1 completed successfully', {
      emailMarkedAsRead: preparationPhase.phaseResult.emailMarkedAsRead,
      confidenceVerified: preparationPhase.phaseResult.confidenceVerified,
    });

    const orderDiscoveryPhase = await executePhase(
      'Phase 2: Order Discovery',
      () => handleOrderCancellationOrderDiscovery(context),
      'Workflow cancelled during order discovery phase',
    );
    if (orderDiscoveryPhase.shouldExit) return orderDiscoveryPhase.result;
    const orderDiscoveryResult = orderDiscoveryPhase.phaseResult;
    log.info('Phase 2 completed successfully', {
      orderNumber: orderDiscoveryResult.orderNumber,
      requiredCustomerInteraction: orderDiscoveryResult.requiredCustomerInteraction,
      customerReplied: orderDiscoveryResult.customerReplied,
    });

    const orderProcessingPhase = await executePhase(
      'Phase 3: Order Processing',
      () => handleOrderCancellationOrderProcessing(context, orderDiscoveryResult.orderDetection),
      'Workflow cancelled during order processing phase',
    );
    if (orderProcessingPhase.shouldExit) return orderProcessingPhase.result;
    const orderProcessingResult = orderProcessingPhase.phaseResult;
    log.info('Phase 3 completed successfully', {
      orderFetched: orderProcessingResult.orderFetched,
      acknowledgementSent: orderProcessingResult.acknowledgementSent,
    });

    const fulfillmentPhase = await executePhase(
      'Phase 4: Fulfillment Routing & Cancellation',
      () => handleOrderCancellationFulfillment(context),
      'Workflow cancelled during fulfillment/cancellation phase',
    );
    if (fulfillmentPhase.shouldExit) return fulfillmentPhase.result;
    const fulfillmentResult = fulfillmentPhase.phaseResult;
    log.info('Phase 4 completed successfully', {
      fulfillmentMethod: fulfillmentResult.fulfillmentMethod,
      cancellationEligible: fulfillmentResult.cancellationEligible,
      cancellationProcessed: fulfillmentResult.cancellationProcessed,
      refundProcessed: fulfillmentResult.refundProcessed,
      confirmationSent: fulfillmentResult.confirmationSent,
    });

    // ==========================================
    // Iteration 2 Complete - Mark as Completed
    // ==========================================
    if (state.approvalQueueId) {
      await markApprovalQueueCompleted(state.approvalQueueId, email.userId);
    }

    state.status = 'completed';

    log.info('Order Cancellation iteration 2 completed successfully', {
      orderNumber: state.orderNumber,
      completedPhases: 4,
    });

    return `Order Cancellation workflow iteration 2 completed for order [${state.orderNumber}]`;
  } catch (error) {
    state.status = 'failed';
    log.error('Order Cancellation workflow failed with error', {
      error,
      state: state.status,
    });
    throw error;
  }
}
