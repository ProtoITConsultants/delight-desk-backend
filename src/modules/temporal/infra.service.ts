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
import { SystemSettingsRepository } from '../../database/repos/system-settings.repository';
import { AgentType } from '../../common/agent-types';
import { WORKFLOW_SIGNAL_NAMES } from './workflow-signals.constants';

@Injectable()
export class InfraService {
  private readonly logger = new Logger(InfraService.name);
  private static readonly WAREHOUSE_WORKFLOW_MARKER_REGEX = /\[DD-OC-WF:([^\]]+)\]/i;

  constructor(
    private readonly agentsService: AgentsService,
    private readonly configService: ConfigService,
    private readonly temporalService: TemporalService,
    private readonly emailThreadsRepo: EmailThreadsRepository,
    private readonly systemSettingsRepo: SystemSettingsRepository,
    private readonly classificationService: ClassificationUtil,
  ) {}

  async processEmail(email: EmailEntity) {
    const workflowId = `workflow-thread-${email.threadId}`;
    const thread = await this.emailThreadsRepo.findById(email.threadId);
    const warehouseRoutedWorkflowId = this.extractWarehouseReplyWorkflowId(email);
    const senderEmail = this.extractPlainEmailAddress(email.fromEmail);

    // Warehouse replies can arrive on a standalone thread. Route them directly
    // to the originating order-cancellation workflow via explicit marker token.
    if (warehouseRoutedWorkflowId && senderEmail) {
      try {
        const handle: any = await this.temporalService.getWorkflowHandle(warehouseRoutedWorkflowId);
        const state = await handle.query('state');
        const workflowUserId = state?.email?.userId as string | undefined;
        if (!workflowUserId) {
          this.logger.warn(
            `Warehouse-routed workflow ${warehouseRoutedWorkflowId} has no state userId; falling back to default processing`,
          );
        } else {
          const settings = await this.systemSettingsRepo.findByUser(workflowUserId);
          const configuredWarehouseEmail = this.extractPlainEmailAddress(
            settings?.warehouseEmail || null,
          );

          if (!configuredWarehouseEmail) {
            this.logger.warn(
              `Warehouse-routed workflow ${warehouseRoutedWorkflowId} has no configured warehouse email; falling back to default processing`,
            );
          } else if (senderEmail !== configuredWarehouseEmail) {
            this.logger.warn(
              `Warehouse marker ignored because sender ${senderEmail} does not match configured warehouse email for workflow ${warehouseRoutedWorkflowId}`,
            );
          } else {
            await handle.signal(WORKFLOW_SIGNAL_NAMES.WAREHOUSE_REPLY, email);
            this.logger.log(`Routed warehouse reply to workflow ${warehouseRoutedWorkflowId}`);
            return;
          }
        }
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          this.logger.warn(
            `Warehouse-routed workflow ${warehouseRoutedWorkflowId} not found - falling back to default email processing`,
          );
        } else {
          throw new BadRequestException(error.message);
        }
      }
    } else if (warehouseRoutedWorkflowId && !senderEmail) {
      this.logger.warn(
        `Warehouse marker found but sender email missing; falling back to default processing for email ${email.id}`,
      );
    }

    // Existing thread handling for regular customer replies.
    if (thread.workflowId) {
      try {
        const handle: any = await this.temporalService.getWorkflowHandle(thread.workflowId);
        await handle.signal(WORKFLOW_SIGNAL_NAMES.CUSTOMER_REPLY, email);
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          this.logger.log(
            `Workflow ${thread.workflowId} already completed - treating email as new thread`,
          );
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

  private extractWarehouseReplyWorkflowId(email: EmailEntity): string | null {
    const subject = email.subject || '';
    const body = email.body || '';
    const searchableText = `${subject}\n${body}`;
    const match = searchableText.match(InfraService.WAREHOUSE_WORKFLOW_MARKER_REGEX);
    return match?.[1]?.trim() || null;
  }

  private extractPlainEmailAddress(email: string | null | undefined): string | null {
    if (!email) return null;
    const match = email.match(/<([^>]+)>/);
    return (match ? match[1] : email).trim().toLowerCase();
  }
}
