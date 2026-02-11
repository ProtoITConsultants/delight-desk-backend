import * as wf from '@temporalio/workflow';
import { handleWismo } from './agents/wismo';
import { WorkFlowInput } from '../types';
import { handleOrderCancellation } from './agents/order-cancellation/order-cancellation-main.workflow';

/**
 * Signal for receiving thread messages
 * Must be defined at module level for Temporal compatibility
 */
export const threadMessage = wf.defineSignal<[WorkFlowInput]>('threadMessage');

/**
 * Email Workflow Orchestrator Class
 * Manages routing of emails to appropriate agent workflows
 */
class EmailWorkflowOrchestrator {
  private workflowInputQueue: WorkFlowInput[];

  constructor(initialInput: WorkFlowInput) {
    this.workflowInputQueue = [initialInput];
    this.setupSignalHandler();
  }

  /**
   * Set up signal handler for thread messages
   */
  private setupSignalHandler(): void {
    wf.setHandler(threadMessage, (workflowInput: WorkFlowInput) => {
      this.workflowInputQueue.push(workflowInput);
      wf.log.info('Thread message received and queued', {
        category: workflowInput.classification.category,
        queueLength: this.workflowInputQueue.length,
      });
    });
  }

  /**
   * Main processing loop
   * Continuously processes emails from the queue
   */
  async processQueue(): Promise<string> {
    // Wait for messages in queue
    await wf.condition(() => this.workflowInputQueue.length > 0);

    // Dequeue and process first message
    const workFlowInput = this.workflowInputQueue.shift()!;

    // Route to appropriate agent and return result
    return await this.routeToAgent(workFlowInput);
  }

  /**
   * Route email to appropriate agent workflow based on classification
   */
  private async routeToAgent(input: WorkFlowInput): Promise<string> {
    const agentType = input.classification.category;

    wf.log.info('Routing email to agent', {
      agentType,
      emailId: input.email.id,
      confidence: input.classification.confidence,
    });

    switch (agentType) {
      case 'wismo':
        return await this.handleWismoWorkflow(input);

      case 'order_cancellation':
        return await this.handleOrderCancellationWorkflow(input);

      case 'subscription':
        return await this.handleSubscriptionWorkflow(input);

      case 'product':
        return await this.handleProductWorkflow(input);

      case 'returns':
        return await this.handleReturnsWorkflow(input);

      case 'promo_code':
        return await this.handlePromoCodeWorkflow(input);

      case 'address_change':
        return await this.handleAddressChangeWorkflow(input);

      case 'escalation':
        return await this.handleEscalationWorkflow(input);

      case 'thankful':
        return await this.handleThankfulWorkflow(input);

      default:
        wf.log.warn('Unknown agent category', { agentType });
        return `Unknown agent category found: ${agentType}, so the workflow is completed here!`;
    }
  }

  /**
   * Handle WISMO (Where Is My Order) workflow
   */
  private async handleWismoWorkflow(input: WorkFlowInput): Promise<string> {
    return await handleWismo(input);
  }

  /**
   * Handle Order Cancellation workflow
   */
  private async handleOrderCancellationWorkflow(input: WorkFlowInput): Promise<string> {
    return handleOrderCancellation(input);
  }

  /**
   * Handle Subscription workflow
   * TODO: Implement subscription agent workflow
   */
  private async handleSubscriptionWorkflow(input: WorkFlowInput): Promise<string> {
    wf.log.info('Subscription workflow not yet implemented', {
      emailId: input.email.id,
    });
    return `Subscription workflow not yet implemented for email [${input.email.id}]`;
  }

  /**
   * Handle Product inquiry workflow
   * TODO: Implement product agent workflow
   */
  private async handleProductWorkflow(input: WorkFlowInput): Promise<string> {
    wf.log.info('Product workflow not yet implemented', {
      emailId: input.email.id,
    });
    return `Product workflow not yet implemented for email [${input.email.id}]`;
  }

  /**
   * Handle Returns workflow
   * TODO: Implement returns agent workflow
   */
  private async handleReturnsWorkflow(input: WorkFlowInput): Promise<string> {
    wf.log.info('Returns workflow not yet implemented', {
      emailId: input.email.id,
    });
    return `Returns workflow not yet implemented for email [${input.email.id}]`;
  }

  /**
   * Handle Promo Code workflow
   * TODO: Implement promo code agent workflow
   */
  private async handlePromoCodeWorkflow(input: WorkFlowInput): Promise<string> {
    wf.log.info('Promo code workflow not yet implemented', {
      emailId: input.email.id,
    });
    return `Promo code workflow not yet implemented for email [${input.email.id}]`;
  }

  /**
   * Handle Address Change workflow
   * TODO: Implement address change agent workflow
   */
  private async handleAddressChangeWorkflow(input: WorkFlowInput): Promise<string> {
    wf.log.info('Address change workflow not yet implemented', {
      emailId: input.email.id,
    });
    return `Address change workflow not yet implemented for email [${input.email.id}]`;
  }

  /**
   * Handle Escalation workflow
   * TODO: Implement escalation agent workflow
   */
  private async handleEscalationWorkflow(input: WorkFlowInput): Promise<string> {
    wf.log.info('Escalation workflow not yet implemented', {
      emailId: input.email.id,
    });
    return `Escalation workflow not yet implemented for email [${input.email.id}]`;
  }

  /**
   * Handle Thankful workflow
   * TODO: Implement thankful agent workflow
   */
  private async handleThankfulWorkflow(input: WorkFlowInput): Promise<string> {
    wf.log.info('Thankful workflow not yet implemented', {
      emailId: input.email.id,
    });
    return `Thankful workflow not yet implemented for email [${input.email.id}]`;
  }
}

/**
 * Main email workflow entry point
 * Temporal requires this to be an exported function at module level
 *
 * @param workflowInput - Email and classification data
 */
export async function processEmailWorkflow(workflowInput: WorkFlowInput): Promise<string> {
  wf.log.info('Email workflow started', {
    emailId: workflowInput.email.id,
    category: workflowInput.classification.category,
    confidence: workflowInput.classification.confidence,
  });

  // Create orchestrator and process
  const orchestrator = new EmailWorkflowOrchestrator(workflowInput);
  const result = await orchestrator.processQueue();

  wf.log.info('Email workflow completed', {
    emailId: workflowInput.email.id,
    result: result.substring(0, 100), // Log first 100 chars
  });

  return result;
}
