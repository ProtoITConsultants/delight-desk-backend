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
import { ACTIVITY_TIMEOUTS } from './address-change.constants';
import { AddressChangeWorkflowState } from './address-change.types';
import { handleAddressChangePreparation } from './sub-workflows/address-change-preparation.sub-workflow';
import { handleAddressChangeOrderDiscovery } from './sub-workflows/address-change-order-discovery.sub-workflow';
import { handleAddressChangeOrderProcessing } from './sub-workflows/address-change-order-processing.sub-workflow';
import { handleAddressChangeFulfillment } from './sub-workflows/address-change-fulfillment.sub-workflow';
import { EmailEntity } from '../../../../../database/schema';
import { WORKFLOW_SIGNAL_NAMES } from '../../../workflow-signals.constants';

const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);
const { getUserAgentSettings } = aiIdentityActivities;

export const humanResponseSignal = defineSignal<[HumanResponse, string?]>(
  WORKFLOW_SIGNAL_NAMES.HUMAN_RESPONSE,
);
export const stateQuery = defineQuery<AddressChangeWorkflowState>('state');
export const customerReplySignal = defineSignal<[EmailEntity]>(
  WORKFLOW_SIGNAL_NAMES.CUSTOMER_REPLY,
);
export const warehouseReplySignal = defineSignal<[EmailEntity]>(
  WORKFLOW_SIGNAL_NAMES.WAREHOUSE_REPLY,
);

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
    if (phaseResult.escalation) {
      return {
        shouldExit: true,
        result: `Escalated: ${phaseResult.escalation.reason}`,
      };
    }

    return { shouldExit: true, result: cancelledMessage };
  }

  return { shouldExit: false, phaseResult };
}

export async function handleAddressChange(wfInput: WorkFlowInput): Promise<string> {
  const wfInfo = workflowInfo();
  const { email, classification } = wfInput;

  let state: AddressChangeWorkflowState = {
    email,
    classification,
    escalation: {},
    humanResponse: {},
    actionResponses: {},
    status: 'processing',
    lastUpdated: new Date(),
    latestCustomerMessageBody: email.body || '',
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

  setHandler(customerReplySignal, (replyEmail: EmailEntity) => {
    state.customerReplyEmail = replyEmail;
    state.latestCustomerMessageBody = replyEmail.body || state.latestCustomerMessageBody;
    state.lastUpdated = new Date();
  });

  setHandler(warehouseReplySignal, (replyEmail: EmailEntity) => {
    state.warehouseReplyEmail = replyEmail;
    state.lastUpdated = new Date();
  });

  setHandler(stateQuery, () => state);

  const agentSettings = await getUserAgentSettings(email.userId, 'address_change');
  const context: ActionExecutionContext<AddressChangeWorkflowState> = {
    workflowId: wfInfo.workflowId,
    workflowRunId: wfInfo.runId,
    userId: email.userId,
    email,
    state,
    requiresModeration: agentSettings.requiresModeration || false,
    agentType: 'Address Change Agent',
  };

  const preparationPhase = await executePhase(
    'Phase 1: Preparation',
    () => handleAddressChangePreparation(context),
    'Workflow cancelled during preparation phase',
  );
  if (preparationPhase.shouldExit) return preparationPhase.result;

  const discoveryPhase = await executePhase(
    'Phase 2: Order Discovery',
    () => handleAddressChangeOrderDiscovery(context),
    'Workflow cancelled during order discovery phase',
  );
  if (discoveryPhase.shouldExit) return discoveryPhase.result;
  const orderDetection = discoveryPhase.phaseResult.orderDetection;

  const processingPhase = await executePhase(
    'Phase 3: Order Processing',
    () => handleAddressChangeOrderProcessing(context, orderDetection),
    'Workflow cancelled during order processing phase',
  );
  if (processingPhase.shouldExit) return processingPhase.result;

  const fulfillmentPhase = await executePhase(
    'Phase 4: Fulfillment Routing & Address Change',
    () => handleAddressChangeFulfillment(context),
    'Workflow cancelled during fulfillment phase',
  );
  if (fulfillmentPhase.shouldExit) return fulfillmentPhase.result;

  if (state.approvalQueueId) {
    await markApprovalQueueCompleted(state.approvalQueueId, email.userId);
  }

  state.status = 'completed';
  return `Address Change workflow completed for order [${state.orderNumber}]`;
}
