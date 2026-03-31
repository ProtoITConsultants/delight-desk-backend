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
import { ProductWorkflowState } from './product.types';
import { ACTIVITY_TIMEOUTS } from './product.constants';
import { handleProductResponse } from './sub-workflows/product-response.sub-workflow';
import { WORKFLOW_SIGNAL_NAMES } from '../../../workflow-signals.constants';

const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);
const { getUserAgentSettings } = aiIdentityActivities;

export const humanResponseSignal = defineSignal<[HumanResponse, string?]>(
  WORKFLOW_SIGNAL_NAMES.HUMAN_RESPONSE,
);
export const stateQuery = defineQuery<ProductWorkflowState>('state');

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
    log.error(`${label} failed`, { escalation: phaseResult.escalation });
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

export async function handleProduct(wfInput: WorkFlowInput): Promise<string> {
  const wfInfo = workflowInfo();
  const { email, classification } = wfInput;

  let state: ProductWorkflowState = {
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
      if (!state.actionResponses) {
        state.actionResponses = {};
      }
      state.actionResponses[approvalItemId] = response;
    }
  });

  setHandler(stateQuery, () => state);

  try {
    const agentSettings = await getUserAgentSettings(email.userId, 'product');
    const context: ActionExecutionContext<ProductWorkflowState> = {
      workflowId: wfInfo.workflowId,
      workflowRunId: wfInfo.runId,
      userId: email.userId,
      email,
      state,
      requiresModeration: agentSettings.requiresModeration || false,
      agentType: 'Product Agent',
    };

    const responsePhase = await executePhase(
      'Product Response Phase',
      () => handleProductResponse(context),
      'Product workflow cancelled before response delivery',
    );
    if (responsePhase.shouldExit) {
      return responsePhase.result;
    }

    if (state.approvalQueueId) {
      await markApprovalQueueCompleted(state.approvalQueueId, email.userId);
    }
    state.status = 'completed';

    return `Product workflow completed successfully for email [${email.id}]`;
  } catch (error) {
    state.status = 'failed';
    log.error('Product workflow failed with error', {
      error,
      workflowId: wfInfo.workflowId,
      emailId: email.id,
    });
    throw error;
  }
}
