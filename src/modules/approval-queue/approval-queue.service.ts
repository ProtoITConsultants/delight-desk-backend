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

  async getApprovalQueueItems(userId: string, dto: GetApprovalQueueDto): Promise<any> {
    const { page = 1, limit = 20, status, category, priority } = dto;

    const offset = (page - 1) * limit;

    const filters = {
      userId,
      status,
      category,
      priority,
      limit: limit,
      offset,
    };

    const items = await this.approvalQueueRepository.getApprovalQueueWithFilters(filters);
    const totalItems = items.length > 0 ? items[0].totalItems : 0;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;

    if (items.length === 0) {
      return {
        data: [],
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit,
          hasNextPage: false,
          hasPreviousPage: page > 1,
        },
      };
    }

    const ids = items.map((item) => item.approval.id);
    const allActions = await this.approvalQueueActionsRepository.getActionsForApprovalQueueIds(ids);
    const actionsByApprovalId = allActions.reduce<Record<string, typeof allActions>>(
      (acc, action) => {
        const key = action.approvalQueueId;
        if (!acc[key]) acc[key] = [];
        acc[key].push(action);
        return acc;
      },
      {},
    );

    const data = items.map((item) => {
      const actions = actionsByApprovalId[item.approval.id] ?? [];
      return {
        id: item.approval.id,
        workflowId: item.approval.workflowId,
        status: item.approval.status,
        category: item.approval.category,
        customerEmail: item.approval.customerEmail,
        customerName: item.approval.customerName,
        emailSubject: item.approval.emailSubject,
        originalCustomerEmailBody: item.approval.emailBody,
        createdAt: item.approval.createdAt,
        workflowActions: actions.map((action) => ({
          id: action.id,
          name: action.name,
          description: action.description,
          actionDetails: action.actionDetails,
          status: action.actionStatus,
          step: action.actionStep,
          createdAt: action.createdAt,
          proposedEmailBody: action.proposedEmailBody,
        })),
      };
    });

    return {
      data,
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

  async cancelWorkflow(userId: string, workflowId: string) {
    const workflow = await this.approvalQueueRepository.findByWorkflowId(workflowId, userId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const nonCancellableStatuses = ['completed', 'escalated', 'cancelled'];
    if (nonCancellableStatuses.includes(workflow.status)) {
      throw new BadRequestException(`Cannot cancel a workflow with status: ${workflow.status}`);
    }

    await this.infraService.cancelWorkflow(workflowId);

    await this.approvalQueueRepository.cancelWorkflowTransactionally(workflow.id, userId);

    return { message: 'Workflow cancelled successfully' };
  }

  async getStats(userId: string): Promise<ApprovalQueueStatsResponse> {
    return await this.approvalQueueRepository.getStats(userId);
  }
}
