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
export const stateQuery = defineQuery<WismoWorkflowState>('state');

/**
 * Signal sent by InfraService whenever a new inbound email arrives on the thread.
 * The order-discovery sub-workflow waits on this via condition() instead of polling.
 */
export const customerReplySignal = defineSignal<[EmailEntity]>(WORKFLOW_SIGNAL_NAMES.CUSTOMER_REPLY);

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

  // Set up signal handler to route responses to specific actions
  // CRITICAL: Must be at main workflow level (Temporal requirement)
  setHandler(humanResponseSignal, (response: HumanResponse, approvalItemId?: string) => {
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

    const preparationPhase = await executePhase(
      'Phase 1: Preparation',
      () => handleWismoPreparation(context),
      'Workflow cancelled during preparation phase',
    );
    if (preparationPhase.shouldExit) return preparationPhase.result;
    log.info('Phase 1 completed successfully', {
      emailMarkedAsRead: preparationPhase.phaseResult.emailMarkedAsRead,
      confidenceVerified: preparationPhase.phaseResult.confidenceVerified,
    });

    const orderDiscoveryPhase = await executePhase(
      'Phase 2: Order Discovery',
      () => handleWismoOrderDiscovery(context),
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
      () => handleWismoOrderProcessing(context, orderDiscoveryResult.orderDetection),
      'Workflow cancelled during order processing phase',
    );
    if (orderProcessingPhase.shouldExit) return orderProcessingPhase.result;
    const orderProcessingResult = orderProcessingPhase.phaseResult;
    log.info('Phase 3 completed successfully', {
      orderFetched: orderProcessingResult.orderFetched,
      acknowledgementSent: orderProcessingResult.acknowledgementSent,
    });

    const trackingPhase = await executePhase(
      'Phase 4: Tracking (long-running)',
      () => handleWismoTracking(context),
      'Workflow cancelled during tracking phase',
    );
    if (trackingPhase.shouldExit) return trackingPhase.result;
    const trackingResult = trackingPhase.phaseResult;
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
