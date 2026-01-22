import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalQueueRepository } from '../../database/repos/approval-queue.repository';
import {
  ApprovalQueueStatsResponse,
  ApproveItemDto,
  EditAndApproveDto,
  GetApprovalQueueDto,
  RejectItemDto,
} from './approval-queue.dto';
import { HumanDecision } from '../email-pipeline/types';
import { EmailPipelineService } from '../email-pipeline/email-pipeline.service';

@Injectable()
export class ApprovalQueueService {
  constructor(
    private readonly approvalQueueRepository: ApprovalQueueRepository,
    private readonly emailPipelineService: EmailPipelineService,
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

    return {
      data: items.map((item) => ({
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
        proposedResponse: item.approval.proposedResponse,
        editedResponse: item.approval.editedResponse,
        workflowMetadata: item.approval.workflowMetadata,
        plannedSteps: item.approval.plannedSteps,
        reviewedBy: item.approval.reviewedBy,
        reviewedAt: item.approval.reviewedAt,
        rejectionReason: item.approval.rejectionReason,
        reviewNotes: item.approval.reviewNotes,
        executedAt: item.approval.executedAt,
        executionResult: item.approval.executionResult,
        createdAt: item.approval.createdAt,
        updatedAt: item.approval.updatedAt,
      })),
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
    const item = await this.approvalQueueRepository.findByIdWithDetails(id, userId);

    if (!item) {
      throw new NotFoundException('Approval queue item not found');
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
      proposedResponse: item.approval.proposedResponse,
      editedResponse: item.approval.editedResponse,
      workflowMetadata: item.approval.workflowMetadata,
      plannedSteps: item.approval.plannedSteps,
      reviewedBy: item.approval.reviewedBy,
      reviewedAt: item.approval.reviewedAt,
      rejectionReason: item.approval.rejectionReason,
      reviewNotes: item.approval.reviewNotes,
      executedAt: item.approval.executedAt,
      executionResult: item.approval.executionResult,
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

  async approveItem(userId: string, id: string, reviewedBy: string, dto: ApproveItemDto) {
    const item = await this.approvalQueueRepository.findById(id, userId);

    if (!item) {
      throw new NotFoundException('Approval queue item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('You do not have permission to approve this item');
    }

    if (item.status !== 'pending') {
      throw new BadRequestException(`Cannot approve item with status: ${item.status}`);
    }

    // Update approval queue status
    const updated = await this.approvalQueueRepository.approveItem(
      id,
      userId,
      reviewedBy,
      dto.notes,
    );

    // Send signal to Temporal workflow to continue execution
    await this.emailPipelineService.sendApprovalSignalToWorkflow(item.workflowId, {
      decision: HumanDecision.APPROVE,
      respondedBy: reviewedBy,
      respondedAt: new Date(),
      notes: dto.notes,
    });

    return updated;
  }

  async rejectItem(userId: string, id: string, reviewedBy: string, dto: RejectItemDto) {
    const item = await this.approvalQueueRepository.findById(id, userId);

    if (!item) {
      throw new NotFoundException('Approval queue item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('You do not have permission to reject this item');
    }

    if (item.status !== 'pending') {
      throw new BadRequestException(`Cannot reject item with status: ${item.status}`);
    }

    // Update approval queue status
    const updated = await this.approvalQueueRepository.rejectItem(
      id,
      userId,
      reviewedBy,
      dto.reason,
      dto.notes,
    );

    // Send signal to Temporal workflow
    await this.emailPipelineService.sendApprovalSignalToWorkflow(item.workflowId, {
      decision: HumanDecision.REJECT,
      respondedBy: reviewedBy,
      respondedAt: new Date(),
      notes: dto.notes,
    });

    return updated;
  }

  async editAndApprove(userId: string, id: string, reviewedBy: string, dto: EditAndApproveDto) {
    const item = await this.approvalQueueRepository.findById(id, userId);

    if (!item) {
      throw new NotFoundException('Approval queue item not found');
    }

    if (item.userId !== userId) {
      throw new ForbiddenException('You do not have permission to edit this item');
    }

    if (item.status !== 'pending') {
      throw new BadRequestException(`Cannot edit item with status: ${item.status}`);
    }

    // Update approval queue with edited response
    const updated = await this.approvalQueueRepository.editAndApprove(
      id,
      userId,
      reviewedBy,
      dto.editedResponse,
      dto.notes,
    );

    // Send signal to Temporal workflow with edited response
    await this.emailPipelineService.sendApprovalSignalToWorkflow(item.workflowId, {
      decision: HumanDecision.MODIFY_AND_APPROVE,
      modifiedData: {
        message: dto.editedResponse,
      },
      respondedBy: reviewedBy,
      respondedAt: new Date(),
      notes: dto.notes,
    });

    return updated;
  }

  async getStats(userId: string): Promise<ApprovalQueueStatsResponse> {
    return await this.approvalQueueRepository.getStats(userId);
  }
}
