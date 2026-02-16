import { EmailEntity } from 'src/database/schema';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ClassificationUtil } from './utils/classification.util';
import { TemporalService } from 'nestjs-temporal-core';
import { WorkFlowInput } from './types';
import { ConfigService } from '@nestjs/config';
import { WorkflowNotFoundError } from '@temporalio/common';
import { AgentsService } from '../agents/agents.service';
import { EmailThreadsRepository } from '../../database/repos/email-threads.repository';
import { AgentType } from '../../common/agent-types';
import { threadMessage } from './workflows/email.workflow';
import { humanResponseSignal } from './workflows/agents/wismo';

@Injectable()
export class InfraService {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly configService: ConfigService,
    private readonly temporalService: TemporalService,
    private readonly emailThreadsRepo: EmailThreadsRepository,
    private readonly classificationService: ClassificationUtil,
  ) {}

  async processEmail(email: EmailEntity) {
    const workflowId = `workflow-thread-${email.threadId}`;
    const classification = await this.classificationService.classify(email);

    const { isEnabled } = await this.agentsService.getAgentSettings(
      classification.category as AgentType,
      email,
    );

    if (!isEnabled) {
      console.log(`Agent: ${classification.category} is Not Enabled.`);
      return;
    }

    const workflowInput: WorkFlowInput = { email, classification };
    const thread = await this.emailThreadsRepo.findById(email.threadId);

    if (!thread.workflowId) {
      await this.temporalService.startWorkflow('processEmailWorkflow', [workflowInput], {
        workflowId: workflowId,
        taskQueue: this.configService.get('TEMPORAL_TASK_QUEUE'),
      });

      await this.emailThreadsRepo.updateById(thread.id, { workflowId });
    }

    if (thread.workflowId) {
      try {
        const handle: any = await this.temporalService.getWorkflowHandle(thread.workflowId);
        await handle.signal(threadMessage, workflowInput);
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          throw new ConflictException(error.message);
        }
        throw new BadRequestException(error.message);
      }
    }
  }

  async sendApprovalSignalToWorkflow(
    workflowId: string,
    humanResponse: any,
    approvalItemId?: string,
  ) {
    try {
      const handle: any = await this.temporalService.getWorkflowHandle(workflowId);
      // Pass both the human response and the approval item ID
      // This allows the workflow to route the response to the correct action
      await handle.signal(humanResponseSignal, humanResponse, approvalItemId);
    } catch (error) {
      console.error('Failed to send signal to workflow:', error);
      throw new Error('Failed to send approval signal to workflow');
    }
  }
}
