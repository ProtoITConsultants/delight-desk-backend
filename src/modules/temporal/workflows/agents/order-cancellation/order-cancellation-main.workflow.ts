/**
 * Order Cancellation Agent Main Workflow
 *
 * Orchestrates the complete order cancellation flow through 5 phases:
 * 1. Preparation: Mark email as read, verify confidence
 * 2. Order Discovery: Extract order number, request from customer if needed
 * 3. Order Processing: Fetch order
 * 4. Eligibility Check: Time-based eligibility, email validation
 * 5. Fulfillment Processing: Process cancellation based on fulfillment method
 */

import {
  defineQuery,
  defineSignal,
  log,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import { ActionExecutionContext, WorkFlowInput, WorkflowState } from '../../../types';
import { handleOrderCancellationPreparation } from './sub-workflows/order-cancellation-preparation.sub-workflow';
import { ACTIVITY_TIMEOUTS, RETRY_POLICIES } from './order-cancellation.constants';
import type { AiIdentityActivities } from '../../../activities/shared/ai-identity.activities';

// Proxy activities needed at main workflow level
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.fetchOrder,
  retry: RETRY_POLICIES.standard,
});
const { getUserAgentSettings } = aiIdentityActivities;

// Define signals for human interaction
export const humanResponseSignal = defineSignal<[string]>('humanResponse');
export const stateQuery = defineQuery<WorkflowState>('state');

export async function handleOrderCancellation(wfInput: WorkFlowInput): Promise<string> {
  const wfInfo = workflowInfo();
  const { email, classification } = wfInput;

  // Initialize workflow state
  let state: WorkflowState = {
    email,
    classification,
    status: 'processing',
    actionResponses: {},
    escalation: {},
    humanResponse: {},
    lastUpdated: new Date(),
  };

  // Set up signal and query handlers
  let humanResponse: string | undefined;

  setHandler(humanResponseSignal, (response: string) => {
    humanResponse = response;
  });

  setHandler(stateQuery, () => state);

  try {
    const agentSettings = await getUserAgentSettings(email.userId, 'order_cancellation');

    // Create action execution context
    const context: ActionExecutionContext = {
      workflowId: wfInfo.workflowId,
      workflowRunId: wfInfo.runId,
      userId: email.userId,
      email,
      state,
      requiresModeration: agentSettings.requiresModeration || false,
      agentType: 'Order Cancellation Agent',
    };

    log.info('Workflow context initialized', {
      requiresModeration: context,
    });

    // ===== PHASE 1: Preparation =====
    const preparationResult = await handleOrderCancellationPreparation(context);

    if (!preparationResult.success) {
      log.error('Preparation phase failed', {
        escalation: preparationResult.escalation,
      });

      if (preparationResult.escalation) {
        return `Escalated: ${preparationResult.escalation.reason}`;
      }
      return 'Workflow cancelled during Order Discovery phase';
    }

    // ===== PHASE 2: Order Discovery =====
    /*
    const orderDiscoveryResult = await handleOrderCancellationOrderDiscovery(context);

    if (!orderDiscoveryResult.success) {
      log.error('Order Discovery phase failed', {
        escalation: orderDiscoveryResult.escalation,
      });

      if (orderDiscoveryResult.escalation) {
        return `Escalated: ${orderDiscoveryResult.escalation.reason}`;
      }
      return 'Workflow cancelled during Order Discovery phase';
    }

    // ===== PHASE 3: Order Processing =====
    const orderProcessingResult = await handleOrderCancellationOrderProcessing(context);

    if (!orderProcessingResult.success) {
      log.error('Order Processing phase failed', {
        escalation: orderProcessingResult.escalation,
      });

      if (orderProcessingResult.escalation) {
        return `Escalated: ${orderProcessingResult.escalation.reason}`;
      }
      return 'Workflow cancelled during Order Processing phase';
    }

    // ===== PHASE 4: Eligibility Check =====
    const eligibilityResult = await handleOrderCancellationEligibility(context);

    if (!eligibilityResult.success) {
      log.error('Eligibility phase failed', {
        escalation: eligibilityResult.escalation,
      });

      if (eligibilityResult.escalation) {
        return `Escalated: ${eligibilityResult.escalation.reason}`;
      }
      return 'Workflow cancelled during Eligibility phase';
    }

    // ===== PHASE 5: Fulfillment Processing =====
    const fulfillmentResult = await handleOrderCancellationFulfillment(context, agentSettings);

    if (!fulfillmentResult.success) {
      log.error('Fulfillment phase failed', {
        escalation: fulfillmentResult.escalation,
      });

      if (fulfillmentResult.escalation) {
        return `Escalated: ${fulfillmentResult.escalation.reason}`;
      }
      return 'Workflow cancelled during Fulfillment phase';
    }
     */

    // ===== Workflow Complete =====
    state.status = 'completed';
    return `Order Cancellation workflow completed successfully for order [${state.orderNumber}]`;
  } catch (error) {
    state.status = 'failed';
    log.error('Order Cancellation workflow failed with error', {
      error,
      state: state,
    });
    throw error;
  }
}
