import * as wf from '@temporalio/workflow';
import { handleWismo } from './wismo.workflow';
import { WorkFlowInput } from '../../types';

export const threadMessage = wf.defineSignal<[WorkFlowInput]>('threadMessage');

export async function processEmailWorkflow(workflowInput: WorkFlowInput) {
  const workflowInputQueue: WorkFlowInput[] = [workflowInput];

  wf.setHandler(threadMessage, (workflowInput: WorkFlowInput) => {
    workflowInputQueue.push(workflowInput);
  });

  while (true) {
    await wf.condition(() => workflowInputQueue.length > 0);

    const workFlowInput = workflowInputQueue.shift()!;

    const agentType = workflowInput.classification.category;

    switch (agentType) {
      case 'wismo':
        return await handleWismo(workFlowInput);
      default:
        return `Unknown agent category found: ${agentType}, so the workflow is completed here!`;
    }
  }
}
