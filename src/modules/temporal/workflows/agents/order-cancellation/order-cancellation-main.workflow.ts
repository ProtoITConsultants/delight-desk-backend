import {
  defineQuery,
  defineSignal,
  log,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import {
  ActionExecutionContext,
  HumanResponse,
  WorkFlowInput,
  WorkflowState,
} from '../../../types';
import { handleOrderCancellationPreparation } from './sub-workflows/order-cancellation-preparation.sub-workflow';
import { ACTIVITY_TIMEOUTS, RETRY_POLICIES } from './order-cancellation.constants';
import type { AiIdentityActivities } from '../../../activities/shared/ai-identity.activities';
import { handleOrderCancellationOrderDiscovery } from './sub-workflows/order-cancellation-order-discovery.sub-workflow';
import { handleOrderCancellationOrderProcessing } from './sub-workflows/order-cancellation-order-processing.sub-workflow';
import { handleOrderCancellationEligibility } from './sub-workflows/order-cancellation-eligibility.sub-workflow';

// Proxy activities needed at main workflow level
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.aiIdentity,
  retry: RETRY_POLICIES.standard,
});
const { getUserAgentSettings } = aiIdentityActivities;

// Define signals for human interaction
export const humanResponseSignal = defineSignal<[HumanResponse, string?]>('humanResponse');
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
  let humanResponse: HumanResponse | null = null;

  setHandler(humanResponseSignal, (response: HumanResponse, approvalItemId?: string) => {
    humanResponse = response;
    state.humanResponse = response;
    state.lastUpdated = new Date();

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
      requiresModeration: context.requiresModeration,
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
      return 'Workflow cancelled during preparation phase';
    }

    // ===== PHASE 2: Order Discovery =====
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

    /*
    // ===== PHASE 5: Fulfillment Processing =====
    const fulfillmentResult = await handleOrderCancellationFulfillment(
      context,
    );

    if (!fulfillmentResult.success) {
      log.error('Fulfillment phase failed', {
        escalation: fulfillmentResult.escalation,
      });

      if (fulfillmentResult.escalation) {
        return `Escalated: ${fulfillmentResult.escalation.reason}`;
      }
      return 'Workflow cancelled during Fulfillment phase';
    }
    if (state.approvalQueueId) {
      const approvalQueueActivitiesForCompletion = proxyActivities<
        typeof import('../../../activities/shared/approval-queue.activities').ApprovalQueueActivities.prototype
      >({ startToCloseTimeout: '1 minute' });

      await approvalQueueActivitiesForCompletion.updateApprovalQueueStatus(
        state.approvalQueueId,
        email.userId,
        'completed',
      );
      log.info('Approval queue marked as completed');
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
