/**
 * WISMO Main Workflow
 * Orchestrates the complete WISMO workflow by coordinating sub-workflows
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
import { WismoWorkflowState } from './wismo.types';
import { ACTIVITY_TIMEOUTS } from './wismo.constants';
import { handleWismoPreparation } from './sub-workflows/wismo-preparation.sub-workflow';
import { handleWismoOrderDiscovery } from './sub-workflows/wismo-order-discovery.sub-workflow';
import { handleWismoOrderProcessing } from './sub-workflows/wismo-order-processing.sub-workflow';
import { handleWismoTracking } from './sub-workflows/wismo-tracking.sub-workflow';
import { EmailEntity } from '../../../../../database/schema';

// Proxy activities needed at main workflow level
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);

const { getUserAgentSettings } = aiIdentityActivities;

// Define signals and queries (MUST be at main workflow level)
export const humanResponseSignal = defineSignal<[HumanResponse, string?]>('humanResponse');
export const stateQuery = defineQuery<WismoWorkflowState>('state');

/**
 * Signal sent by InfraService whenever a new inbound email arrives on the thread.
 * The order-discovery sub-workflow waits on this via condition() instead of polling.
 */
export const customerReplySignal = defineSignal<[EmailEntity]>('customerReply');

/**
 * Main WISMO workflow orchestrator
 * Coordinates all phases of the WISMO workflow
 */
export async function handleWismo(wfInput: WorkFlowInput): Promise<string> {
  const wfInfo = workflowInfo();
  const { email, classification } = wfInput;

  log.info('Starting WISMO main workflow', {
    workflowId: wfInfo.workflowId,
    emailId: email.id,
    classification: classification.category,
    confidence: classification.confidence,
  });

  let state: WismoWorkflowState = {
    email,
    classification,
    trackingRetryCount: 0,
    escalation: {},
    humanResponse: {},
    actionResponses: {},
    status: 'processing',
    lastUpdated: new Date(),
  };

  let humanResponse: HumanResponse | null = null;

  // Set up signal handler to route responses to specific actions
  // CRITICAL: Must be at main workflow level (Temporal requirement)
  setHandler(humanResponseSignal, (response: HumanResponse, approvalItemId?: string) => {
    humanResponse = response;
    state.humanResponse = response;
    state.lastUpdated = new Date();

    // Store response for specific action in workflow state (Temporal-safe!)
    // This replaces the in-memory Map which was not Temporal-safe
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

  // Set up state query handler
  setHandler(stateQuery, () => state);

  try {
    // Get agent settings to determine if moderation is required
    const agentSettings = await getUserAgentSettings(email.userId, 'wismo');

    const context: ActionExecutionContext<WismoWorkflowState> = {
      workflowId: wfInfo.workflowId,
      workflowRunId: wfInfo.runId,
      userId: email.userId,
      email,
      state,
      requiresModeration: agentSettings.requiresModeration || false,
      agentType: 'WISMO Agent',
    };

    log.info('Workflow context initialized', {
      requiresModeration: context.requiresModeration,
    });

    // ==========================================
    // PHASE 1: Preparation (Actions 1-2)
    // ==========================================

    log.info('Executing Phase 1: Preparation');

    const preparationResult = await handleWismoPreparation(context);

    if (!preparationResult.success) {
      log.error('Preparation phase failed', {
        escalation: preparationResult.escalation,
      });

      if (preparationResult.escalation) {
        return `Escalated: ${preparationResult.escalation.reason}`;
      }
      return 'Workflow cancelled during preparation phase';
    }

    log.info('Phase 1 completed successfully', {
      emailMarkedAsRead: preparationResult.emailMarkedAsRead,
      confidenceVerified: preparationResult.confidenceVerified,
    });

    // ==========================================
    // PHASE 2: Order Discovery (Actions 3-3.1)
    // ==========================================

    log.info('Executing Phase 2: Order Discovery');

    const orderDiscoveryResult = await handleWismoOrderDiscovery(context);

    if (!orderDiscoveryResult.success) {
      log.error('Order discovery phase failed', {
        escalation: orderDiscoveryResult.escalation,
      });

      if (orderDiscoveryResult.escalation) {
        return `Escalated: ${orderDiscoveryResult.escalation.reason}`;
      }
      return 'Workflow cancelled during order discovery phase';
    }

    log.info('Phase 2 completed successfully', {
      orderNumber: orderDiscoveryResult.orderNumber,
      requiredCustomerInteraction: orderDiscoveryResult.requiredCustomerInteraction,
      customerReplied: orderDiscoveryResult.customerReplied,
    });

    // ==========================================
    // PHASE 3: Order Processing (Actions 4-5)
    // ==========================================

    log.info('Executing Phase 3: Order Processing');

    const orderProcessingResult = await handleWismoOrderProcessing(
      context,
      orderDiscoveryResult.orderDetection,
    );

    if (!orderProcessingResult.success) {
      log.error('Order processing phase failed', {
        escalation: orderProcessingResult.escalation,
      });

      if (orderProcessingResult.escalation) {
        return `Escalated: ${orderProcessingResult.escalation.reason}`;
      }
      return 'Workflow cancelled during order processing phase';
    }

    log.info('Phase 3 completed successfully', {
      orderFetched: orderProcessingResult.orderFetched,
      acknowledgementSent: orderProcessingResult.acknowledgementSent,
    });

    // ==========================================
    // PHASE 4: Tracking (Actions 6-9)
    // ==========================================

    log.info('Executing Phase 4: Tracking (long-running)');

    const trackingResult = await handleWismoTracking(context);

    if (!trackingResult.success) {
      log.error('Tracking phase failed', {
        escalation: trackingResult.escalation,
      });

      if (trackingResult.escalation) {
        return `Escalated: ${trackingResult.escalation.reason}`;
      }
      return 'Workflow cancelled during tracking phase';
    }

    log.info('Phase 4 completed successfully', {
      trackingNumber: trackingResult.trackingNumber,
      delivered: trackingResult.delivered,
      updatesCount: trackingResult.updatesCount,
      finalNotificationSent: trackingResult.finalNotificationSent,
    });

    // ==========================================
    // Workflow Complete - Mark as Completed
    // ==========================================

    if (state.approvalQueueId) {
      await markApprovalQueueCompleted(state.approvalQueueId, email.userId);
    }

    state.status = 'completed';

    log.info('WISMO workflow completed successfully', {
      orderNumber: state.orderNumber,
      totalPhases: 4,
    });

    return `WISMO workflow completed successfully for order [${state.orderNumber}]`;
  } catch (error) {
    state.status = 'failed';
    log.error('WISMO workflow failed with error', {
      error,
      state: state.status,
    });
    throw error;
  }
}
