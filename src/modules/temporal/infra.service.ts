import { EmailEntity } from 'src/database/schema';
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ClassificationUtil } from './utils/classification.util';
import { TemporalService } from 'nestjs-temporal-core';
import { WorkFlowInput } from './workflows/types';
import { ConfigService } from '@nestjs/config';
import { WorkflowNotFoundError } from '@temporalio/common';
import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { AgentsService } from '../agents/agents.service';
import { EmailThreadsRepository } from '../../database/repos/email-threads.repository';
import { AgentType } from '../../common/agent-types';
import { WORKFLOW_SIGNAL_NAMES } from './workflow-signals.constants';

@Injectable()
export class InfraService {
  private readonly logger = new Logger(InfraService.name);

  constructor(
    private readonly agentsService: AgentsService,
    private readonly configService: ConfigService,
    private readonly temporalService: TemporalService,
    private readonly emailThreadsRepo: EmailThreadsRepository,
    private readonly classificationService: ClassificationUtil,
  ) {}

  async processEmail(email: EmailEntity) {
    const workflowId = `workflow-thread-${email.threadId}`;
    const thread = await this.emailThreadsRepo.findById(email.threadId);

    // If a workflow is already running for this thread, deliver the email as a
    // customer-reply signal directly.  We skip re-classification here so that
    // a short follow-up ("My order id is 23433") is never silently dropped
    // because it classifies as a different or disabled agent category.
    if (thread.workflowId) {
      try {
        const handle: any = await this.temporalService.getWorkflowHandle(thread.workflowId);
        await handle.signal(WORKFLOW_SIGNAL_NAMES.CUSTOMER_REPLY, email);
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          this.logger.log(
            `Workflow ${thread.workflowId} already completed - treating email as new thread`,
          );
          // Fall through to start a fresh workflow below
        } else {
          throw new BadRequestException(error.message);
        }
      }
      return;
    }

    // New thread - classify the email and start a workflow if the agent is enabled.
    const classification = await this.classificationService.classify(email);
    const executionAgentType: AgentType = classification.category;
    const { isEnabled } = await this.agentsService.getAgentSettings(executionAgentType, email);

    if (!isEnabled) {
      this.logger.log(`Agent: ${executionAgentType} is Not Enabled.`);
      return;
    }

    const workflowInput: WorkFlowInput = { email, classification };

    try {
      await this.temporalService.startWorkflow('processEmailWorkflow', [workflowInput], {
        workflowId: workflowId,
        taskQueue: this.configService.get('TEMPORAL_TASK_QUEUE'),
      });

      await this.emailThreadsRepo.updateById(thread.id, { workflowId });
    } catch (error) {
      // Two webhook notifications for the same first email can arrive within
      // milliseconds of each other (common with Microsoft Graph and Gmail).
      // Both find workflowId = null and try to start the same workflow.
      // The second attempt loses the race — treat it as a no-op.
      if (error instanceof WorkflowExecutionAlreadyStartedError) {
        this.logger.warn(
          `Workflow ${workflowId} already started by a concurrent request — skipping duplicate`,
        );
        return;
      }
      throw error;
    }
  }

  async cancelWorkflow(workflowId: string) {
    try {
      const handle: any = await this.temporalService.getWorkflowHandle(workflowId);
      await handle.cancel();
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        throw new BadRequestException('Workflow not found or already completed');
      }
      throw new BadRequestException('Failed to cancel workflow');
    }
  }

  async sendApprovalSignalToWorkflow(
    workflowId: string,
    humanResponse: any,
    approvalItemId?: string,
  ) {
    try {
      const handle: any = await this.temporalService.getWorkflowHandle(workflowId);
      await handle.signal(WORKFLOW_SIGNAL_NAMES.HUMAN_RESPONSE, humanResponse, approvalItemId);
    } catch (error) {
      this.logger.error('Failed to send signal to workflow:', error);
      throw new Error('Failed to send approval signal to workflow');
    }
  }
}
