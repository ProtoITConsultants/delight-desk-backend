/**
 * Promo Code Main Workflow
 * Orchestrates the Promo Code Agent through three phases:
 *   1. Preparation       - mark email read, verify confidence, distress check
 *   2. Intent classification - sub-classify the customer's intent and resolve config
 *   3. Resolution        - branch on the sub-intent and execute the appropriate handler
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
import { ACTIVITY_TIMEOUTS } from './promo-code.constants';
import { PromoCodeWorkflowState } from './promo-code.types';
import { handlePromoCodePreparation } from './sub-workflows/promo-code-preparation.sub-workflow';
import { handlePromoCodeIntentClassification } from './sub-workflows/promo-code-intent-classification.sub-workflow';
import { handlePromoCodeResolution } from './sub-workflows/promo-code-resolution.sub-workflow';
import { EmailEntity } from '../../../../../database/schema';
import { WORKFLOW_SIGNAL_NAMES } from '../../../workflow-signals.constants';

const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);
const { getUserAgentSettings } = aiIdentityActivities;

export const humanResponseSignal = defineSignal<[HumanResponse, string?]>(
  WORKFLOW_SIGNAL_NAMES.HUMAN_RESPONSE,
);
/**
 * Sent by InfraService whenever a new inbound email arrives on this thread. The
 * order-discovery step waits on this when it has to ask the customer for an order
 * number that wasn't extractable from the original email.
 */
export const customerReplySignal = defineSignal<[EmailEntity]>(
  WORKFLOW_SIGNAL_NAMES.CUSTOMER_REPLY,
);
export const stateQuery = defineQuery<PromoCodeWorkflowState>('state');

interface PhaseExecutionResult {
  success: boolean;
  escalation?: { reason: string };
}

async function executePhase<T extends PhaseExecutionResult>(
  label: string,
  run: () => Promise<T>,
  cancelledMessage: string,
): Promise<{ shouldExit: true; result: string } | { shouldExit: false; phaseResult: T }> {
  log.info(`Executing ${label}`);
  const phaseResult = await run();

  if (!phaseResult.success) {
    log.error(`${label} failed`, { escalation: phaseResult.escalation });
    if (phaseResult.escalation) {
      return { shouldExit: true, result: `Escalated: ${phaseResult.escalation.reason}` };
    }
    return { shouldExit: true, result: cancelledMessage };
  }

  log.info(`${label} completed successfully`);
  return { shouldExit: false, phaseResult };
}

export async function handlePromoCode(wfInput: WorkFlowInput): Promise<string> {
  const wfInfo = workflowInfo();
  const { email, classification } = wfInput;

  log.info('Starting Promo Code main workflow', {
    workflowId: wfInfo.workflowId,
    emailId: email.id,
    classification: classification.category,
    confidence: classification.confidence,
  });

  let state: PromoCodeWorkflowState = {
    email,
    classification,
    escalation: {},
    humanResponse: {},
    actionResponses: {},
    status: 'processing',
    lastUpdated: new Date(),
  };

  setHandler(humanResponseSignal, (response: HumanResponse, approvalItemId?: string) => {
    state.humanResponse = response;
    state.lastUpdated = new Date();
    if (approvalItemId) {
      if (!state.actionResponses) state.actionResponses = {};
      state.actionResponses[approvalItemId] = response;
    }
  });

  setHandler(customerReplySignal, (replyEmail: EmailEntity) => {
    state.customerReplyEmail = replyEmail;
    state.lastUpdated = new Date();
    log.info('Customer reply received via signal', { messageId: replyEmail.messageId });
  });

  setHandler(stateQuery, () => state);

  try {
    const agentSettings = await getUserAgentSettings(email.userId, 'promo_code');

    const context: ActionExecutionContext<PromoCodeWorkflowState> = {
      workflowId: wfInfo.workflowId,
      workflowRunId: wfInfo.runId,
      userId: email.userId,
      email,
      state,
      requiresModeration: agentSettings.requiresModeration || false,
      agentType: 'Promo Code Agent',
    };

    const preparationPhase = await executePhase(
      'Phase 1: Preparation',
      () => handlePromoCodePreparation(context),
      'Workflow cancelled during preparation phase',
    );
    if (preparationPhase.shouldExit) return preparationPhase.result;

    const intentPhase = await executePhase(
      'Phase 2: Intent Classification',
      () => handlePromoCodeIntentClassification(context),
      'Workflow cancelled during intent classification phase',
    );
    if (intentPhase.shouldExit) return intentPhase.result;

    const resolutionPhase = await executePhase(
      'Phase 3: Resolution',
      () => handlePromoCodeResolution(context),
      'Workflow cancelled during resolution phase',
    );
    if (resolutionPhase.shouldExit) return resolutionPhase.result;

    if (state.approvalQueueId) {
      await markApprovalQueueCompleted(state.approvalQueueId, email.userId);
    }

    state.status = 'completed';

    log.info('Promo Code workflow completed successfully', {
      intent: state.intent?.intent,
      refundProcessed: !!state.refundResult,
    });

    return `Promo Code workflow completed for email [${email.id}] with intent [${state.intent?.intent ?? 'unknown'}]`;
  } catch (error) {
    state.status = 'failed';
    log.error('Promo Code workflow failed with error', {
      error,
      workflowId: wfInfo.workflowId,
      emailId: email.id,
    });
    throw error;
  }
}
