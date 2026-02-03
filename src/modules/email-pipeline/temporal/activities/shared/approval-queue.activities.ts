import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ApprovalQueueRepository } from '../../../../../database/repos/approval-queue.repository';
import { ApprovalQueueActionsRepository } from '../../../../../database/repos/approval-queue-actions.repository';

@Injectable()
@Activity()
export class ApprovalQueueActivities {
  constructor(
    private readonly approvalQueueRepository: ApprovalQueueRepository,
    private readonly approvalQueueActionsRepository: ApprovalQueueActionsRepository,
  ) {}

  @ActivityMethod({ name: 'findApprovalQueueByWorkflowId' })
  async findApprovalQueueByWorkflowId(workflowId: string, userId: string): Promise<any> {
    return this.approvalQueueRepository.findByWorkflowId(workflowId, userId);
  }

  @ActivityMethod({ name: 'createApprovalQueueItem' })
  async createApprovalQueueItem(data: any): Promise<any> {
    return this.approvalQueueRepository.createApprovalQueueItem(data);
  }

  @ActivityMethod({ name: 'createApprovalQueueAction' })
  async createApprovalQueueAction(data: any): Promise<any> {
    return this.approvalQueueActionsRepository.createAction(data);
  }

  @ActivityMethod({ name: 'updateApprovalQueueAction' })
  async updateApprovalQueueAction(actionId: string, data: any): Promise<any> {
    return this.approvalQueueActionsRepository.updateAction(actionId, data);
  }

  @ActivityMethod({ name: 'updateApprovalQueueStatus' })
  async updateApprovalQueueStatus(
    approvalQueueId: string,
    userId: string,
    status: string,
    escalationId?: string,
  ): Promise<any> {
    if (status === 'in_progress') {
      return this.approvalQueueRepository.markAsInProgress(approvalQueueId, userId);
    } else if (status === 'completed') {
      return this.approvalQueueRepository.markAsCompleted(approvalQueueId, userId);
    } else if (status === 'escalated' && escalationId) {
      return this.approvalQueueRepository.markAsEscalated(approvalQueueId, userId, escalationId);
    }
    return this.approvalQueueRepository.updateStatus(approvalQueueId, userId, status);
  }

  @ActivityMethod({ name: 'markActionAsExecuted' })
  async markActionAsExecuted(actionId: string, executionResult: any): Promise<any> {
    return this.approvalQueueActionsRepository.markAsExecuted(actionId, executionResult);
  }

  @ActivityMethod({ name: 'markActionAsEscalated' })
  async markActionAsEscalated(
    actionId: string,
    escalationId: string,
    executionError: any,
  ): Promise<any> {
    return this.approvalQueueActionsRepository.markAsEscalated(
      actionId,
      escalationId,
      executionError,
    );
  }

  // Legacy methods kept for backward compatibility
  @ActivityMethod({ name: 'markApprovalQueueItemExecuted' })
  async markApprovalQueueItemExecuted(
    approvalQueueId: string,
    userId: string,
    executionResult: any,
  ): Promise<any> {
    // This method is deprecated but kept for backward compatibility
    // New workflows use markActionAsExecuted instead
    return this.approvalQueueRepository.updateApprovalQueueItem(approvalQueueId, userId, {
      updatedAt: new Date(),
    });
  }

  @ActivityMethod({ name: 'updateApprovalQueueItem' })
  async updateApprovalQueueItem(
    approvalQueueId: string,
    userId: string,
    data: Partial<any>,
  ): Promise<any> {
    return this.approvalQueueRepository.updateApprovalQueueItem(approvalQueueId, userId, data);
  }
}
