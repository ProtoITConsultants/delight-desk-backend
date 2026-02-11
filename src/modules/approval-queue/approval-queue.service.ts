import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalQueueRepository } from '../../database/repos/approval-queue.repository';
import { ApprovalQueueActionsRepository } from '../../database/repos/approval-queue-actions.repository';
import {
  ApprovalQueueStatsResponse,
  EditAndApproveDto,
  GetApprovalQueueDto,
  RejectItemDto,
} from './approval-queue.dto';
import { HumanDecision } from '../temporal/types';
import { InfraService } from '../temporal/infra.service';

@Injectable()
export class ApprovalQueueService {
  constructor(
    private readonly approvalQueueRepository: ApprovalQueueRepository,
    private readonly approvalQueueActionsRepository: ApprovalQueueActionsRepository,
    private readonly infraService: InfraService,
  ) {}

  async getApprovalQueue(userId: string, dto: GetApprovalQueueDto): Promise<any> {
    const { page = 1, limit = 20, status, agentType, priority } = dto;

    const offset = (page - 1) * limit;

    const filters = {
      userId,
      status,
      agentType,
      priority,
      limit,
      offset,
    };

    const items = await this.approvalQueueRepository.getApprovalQueueWithFilters(filters);
    const totalItems = await this.approvalQueueRepository.countApprovalQueueWithFilters(filters);

    const totalPages = Math.ceil(totalItems / limit);

    // For each workflow, get action counts
    const itemsWithActions = await Promise.all(
      items.map(async (item) => {
        const stats = await this.approvalQueueActionsRepository.getActionStats(item.approval.id);

        return {
          id: item.approval.id,
          userId: item.approval.userId,
          emailId: item.approval.emailId,
          threadId: item.approval.threadId,
          workflowId: item.approval.workflowId,
          workflowRunId: item.approval.workflowRunId,
          status: item.approval.status,
          agentType: item.approval.agentType,
          customerEmail: item.approval.customerEmail,
          customerName: item.approval.customerName,
          emailSubject: item.approval.emailSubject,
          category: item.approval.category,
          confidence: item.approval.confidence,
          priority: item.approval.priority,
          sentiment: item.approval.sentiment,
          workflowMetadata: item.approval.workflowMetadata,
          plannedSteps: item.approval.plannedSteps,
          escalationId: item.approval.escalationId,
          escalatedAt: item.approval.escalatedAt,
          completedAt: item.approval.completedAt,
          createdAt: item.approval.createdAt,
          updatedAt: item.approval.updatedAt,
          actionCount: stats.total,
          pendingActionCount: stats.pending,
        };
      }),
    );

    return {
      data: itemsWithActions,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getApprovalQueueById(userId: string, id: string): Promise<any> {
    const item = await this.approvalQueueRepository.findByIdWithActions(id, userId);

    if (!item) {
      throw new NotFoundException('Approval queue workflow not found');
    }

    const activityLog = await this.approvalQueueRepository.getActivityLog(id);

    return {
      id: item.approval.id,
      userId: item.approval.userId,
      emailId: item.approval.emailId,
      threadId: item.approval.threadId,
      workflowId: item.approval.workflowId,
      workflowRunId: item.approval.workflowRunId,
      status: item.approval.status,
      agentType: item.approval.agentType,
      customerEmail: item.approval.customerEmail,
      customerName: item.approval.customerName,
      emailSubject: item.approval.emailSubject,
      emailBody: item.approval.emailBody,
      category: item.approval.category,
      confidence: item.approval.confidence,
      priority: item.approval.priority,
      sentiment: item.approval.sentiment,
      workflowMetadata: item.approval.workflowMetadata,
      plannedSteps: item.approval.plannedSteps,
      escalationId: item.approval.escalationId,
      escalatedAt: item.approval.escalatedAt,
      completedAt: item.approval.completedAt,
      createdAt: item.approval.createdAt,
      updatedAt: item.approval.updatedAt,
      email: item.email
        ? {
            id: item.email.id,
            subject: item.email.subject,
            fromEmail: item.email.fromEmail,
            snippet: item.email.snippet,
          }
        : undefined,
      thread: item.thread
        ? {
            id: item.thread.id,
            threadId: item.thread.threadId,
          }
        : undefined,
      actions: item.actions.map((action) => ({
        id: action.id,
        actionType: action.actionType,
        actionStep: action.actionStep,
        actionStatus: action.actionStatus,
        description: action.description,
        metadata: action.metadata,
        autoApproved: action.autoApproved,
        reviewedBy: action.reviewedBy,
        reviewedAt: action.reviewedAt,
        reviewNotes: action.reviewNotes,
        executedAt: action.executedAt,
        executionResult: action.executionResult,
        executionError: action.executionError,
        escalatedDuringExecution: action.escalatedDuringExecution,
        escalationId: action.escalationId,
        createdAt: action.createdAt,
        updatedAt: action.updatedAt,
      })),
      activityLog: activityLog.map((log) => ({
        id: log.id,
        approvalQueueId: log.approvalQueueId,
        userId: log.userId,
        action: log.action,
        description: log.description,
        metadata: log.metadata,
        createdAt: log.createdAt,
      })),
    };
  }

  async approveAction(userId: string, actionId: string, reviewedBy: string) {
    const action = await this.approvalQueueActionsRepository.findById(actionId);

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const workflow = await this.approvalQueueRepository.findById(action.approvalQueueId, userId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have permission to approve this action');
    }

    if (action.actionStatus !== 'pending_approval') {
      throw new BadRequestException(`Cannot approve action with status: ${action.actionStatus}`);
    }

    // Update action status
    const updated = await this.approvalQueueActionsRepository.updateAction(actionId, {
      actionStatus: 'approved',
      reviewedBy,
      reviewedAt: new Date(),
    });

    // Send signal to Temporal workflow to continue execution
    // Pass the action ID so the workflow can route the response to the correct action
    await this.infraService.sendApprovalSignalToWorkflow(
      workflow.workflowId,
      {
        decision: HumanDecision.APPROVE,
        respondedBy: reviewedBy,
        respondedAt: new Date(),
      },
      actionId, // Pass action ID
    );

    return updated;
  }

  async rejectAction(userId: string, actionId: string, reviewedBy: string, dto: RejectItemDto) {
    const action = await this.approvalQueueActionsRepository.findById(actionId);

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const workflow = await this.approvalQueueRepository.findById(action.approvalQueueId, userId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have permission to reject this action');
    }

    if (action.actionStatus !== 'pending_approval') {
      throw new BadRequestException(`Cannot reject action with status: ${action.actionStatus}`);
    }

    // Update action status
    const updated = await this.approvalQueueActionsRepository.updateAction(actionId, {
      actionStatus: 'rejected',
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: `${dto.reason}${dto.notes ? ` - ${dto.notes}` : ''}`,
    });

    // Send signal to Temporal workflow
    // Pass the action ID so the workflow can route the response to the correct action
    await this.infraService.sendApprovalSignalToWorkflow(
      workflow.workflowId,
      {
        decision: HumanDecision.REJECT,
        respondedBy: reviewedBy,
        respondedAt: new Date(),
        notes: dto.notes,
      },
      actionId, // Pass action ID
    );

    return updated;
  }

  async editAndApprove(
    userId: string,
    actionId: string,
    reviewedBy: string,
    dto: EditAndApproveDto,
  ) {
    const action = await this.approvalQueueActionsRepository.findById(actionId);

    if (!action) {
      throw new NotFoundException('Action not found');
    }

    const workflow = await this.approvalQueueRepository.findById(action.approvalQueueId, userId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (workflow.userId !== userId) {
      throw new ForbiddenException('You do not have permission to edit this action');
    }

    if (action.actionStatus !== 'pending_approval') {
      throw new BadRequestException(`Cannot edit action with status: ${action.actionStatus}`);
    }

    // Update action with edited response
    const actionMetadata = action.metadata || {};
    const updated = await this.approvalQueueActionsRepository.updateAction(actionId, {
      actionStatus: 'approved',
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: dto.notes,
      metadata: {
        ...(typeof actionMetadata === 'object' ? actionMetadata : {}),
        editedResponse: dto.editedResponse,
      },
    });

    // Send signal to Temporal workflow with edited response
    // Pass the action ID so the workflow can route the response to the correct action
    await this.infraService.sendApprovalSignalToWorkflow(
      workflow.workflowId,
      {
        decision: HumanDecision.MODIFY_AND_APPROVE,
        modifiedData: {
          message: dto.editedResponse,
        },
        respondedBy: reviewedBy,
        respondedAt: new Date(),
        notes: dto.notes,
      },
      actionId, // Pass action ID
    );

    return updated;
  }

  async getStats(userId: string): Promise<ApprovalQueueStatsResponse> {
    return await this.approvalQueueRepository.getStats(userId);
  }
}
