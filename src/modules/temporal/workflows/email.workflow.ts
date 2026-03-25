import * as wf from '@temporalio/workflow';
import { handleWismo } from './agents/wismo';
import { handleOrderCancellation } from './agents/order-cancellation';
import { handleAddressChange } from './agents/address-change';
import { WorkFlowInput } from './types';
import { WORKFLOW_SIGNAL_NAMES } from '../workflow-signals.constants';

export const threadMessage = wf.defineSignal<[WorkFlowInput]>(WORKFLOW_SIGNAL_NAMES.THREAD_MESSAGE);

class EmailWorkflowOrchestrator {
  private workflowInputQueue: WorkFlowInput[];

  constructor(initialInput: WorkFlowInput) {
    this.workflowInputQueue = [initialInput];
    this.setupSignalHandler();
  }

  private setupSignalHandler(): void {
    wf.setHandler(threadMessage, (workflowInput: WorkFlowInput) => {
      this.workflowInputQueue.push(workflowInput);
      wf.log.info('Thread message received and queued', {
        category: workflowInput.classification.category,
        queueLength: this.workflowInputQueue.length,
      });
    });
  }

  async processQueue(): Promise<string> {
    await wf.condition(() => this.workflowInputQueue.length > 0);
    const workFlowInput = this.workflowInputQueue.shift()!;
    return await this.routeToAgent(workFlowInput);
  }

  private async routeToAgent(input: WorkFlowInput): Promise<string> {
    const agentType = input.classification.category;

    wf.log.info('Routing email to agent', {
      agentType,
      emailId: input.email.id,
      confidence: input.classification.confidence,
    });

    switch (agentType) {
      case 'wismo':
        return await handleWismo(input);

      case 'order_cancellation':
        return await handleOrderCancellation(input);

      case 'address_change':
        return await handleAddressChange(input);

      case 'subscription':
      case 'product':
      case 'returns':
      case 'promo_code':
        wf.log.info(`${agentType} workflow not yet implemented`, { emailId: input.email.id });
        return `${agentType} workflow not yet implemented for email [${input.email.id}]`;

      default:
        wf.log.warn('Unknown agent category', { agentType });
        return `Unknown agent category found: ${agentType}, so the workflow is completed here!`;
    }
  }
}

export async function processEmailWorkflow(workflowInput: WorkFlowInput): Promise<string> {
  wf.log.info('Email workflow started', {
    emailId: workflowInput.email.id,
    category: workflowInput.classification.category,
    confidence: workflowInput.classification.confidence,
  });

  const orchestrator = new EmailWorkflowOrchestrator(workflowInput);
  const result = await orchestrator.processQueue();

  wf.log.info('Email workflow completed', {
    emailId: workflowInput.email.id,
    result: result.substring(0, 100),
  });

  return result;
}
