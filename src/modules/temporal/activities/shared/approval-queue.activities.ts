import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ApprovalQueueRepository } from 'src/database/repos/approval-queue.repository';
import { ApprovalQueueActionsRepository } from 'src/database/repos/approval-queue-actions.repository';
import { ApprovalQueueEventsService } from 'src/modules/approval-queue/approval-queue-events.service';

@Injectable()
@Activity()
export class ApprovalQueueActivities {
  constructor(
    private readonly approvalQueueRepository: ApprovalQueueRepository,
    private readonly approvalQueueActionsRepository: ApprovalQueueActionsRepository,
    private readonly approvalQueueEventsService: ApprovalQueueEventsService,
  ) {}

  @ActivityMethod({ name: 'findApprovalQueueByWorkflowId' })
  async findApprovalQueueByWorkflowId(workflowId: string, userId: string): Promise<any> {
    return this.approvalQueueRepository.findByWorkflowId(workflowId, userId);
  }

  @ActivityMethod({ name: 'createApprovalQueueItem' })
  async createApprovalQueueItem(data: any): Promise<any> {
    const created = await this.approvalQueueRepository.createApprovalQueueItem(data);
    this.emitQueueUpdated(data?.userId, 'workflow_created');
    return created;
  }

  @ActivityMethod({ name: 'createApprovalQueueAction' })
  async createApprovalQueueAction(data: any): Promise<any> {
    const created = await this.approvalQueueActionsRepository.createAction(data);
    await this.emitQueueUpdatedByApprovalQueueId(data?.approvalQueueId, 'action_created');
    return created;
  }

  @ActivityMethod({ name: 'updateApprovalQueueAction' })
  async updateApprovalQueueAction(actionId: string, data: any): Promise<any> {
    const updated = await this.approvalQueueActionsRepository.updateAction(actionId, data);
    await this.emitQueueUpdatedByActionId(actionId, 'action_updated');
    return updated;
  }

  @ActivityMethod({ name: 'updateApprovalQueueStatus' })
  async updateApprovalQueueStatus(
    approvalQueueId: string,
    userId: string,
    status: string,
    escalationId?: string,
  ): Promise<any> {
    let updated: any;
    if (status === 'in_progress') {
      updated = await this.approvalQueueRepository.markAsInProgress(approvalQueueId, userId);
    } else if (status === 'completed') {
      updated = await this.approvalQueueRepository.markAsCompleted(approvalQueueId, userId);
    } else if (status === 'escalated' && escalationId) {
      updated = await this.approvalQueueRepository.markAsEscalated(
        approvalQueueId,
        userId,
        escalationId,
      );
    } else {
      updated = await this.approvalQueueRepository.updateStatus(approvalQueueId, userId, status);
    }
    this.emitQueueUpdated(userId, 'workflow_status_updated');
    return updated;
  }

  @ActivityMethod({ name: 'markActionAsExecuted' })
  async markActionAsExecuted(actionId: string): Promise<any> {
    const updated = await this.approvalQueueActionsRepository.markAsExecuted(actionId);
    await this.emitQueueUpdatedByActionId(actionId, 'action_executed');
    return updated;
  }

  @ActivityMethod({ name: 'markActionAsEscalated' })
  async markActionAsEscalated(
    actionId: string,
    escalationId: string,
    escalationReason: string,
  ): Promise<any> {
    const updated = await this.approvalQueueActionsRepository.markAsEscalated(
      actionId,
      escalationId,
      escalationReason,
    );
    await this.emitQueueUpdatedByActionId(actionId, 'action_escalated');
    return updated;
  }

  @ActivityMethod({ name: 'updateApprovalQueueItem' })
  async updateApprovalQueueItem(
    approvalQueueId: string,
    userId: string,
    data: Partial<any>,
  ): Promise<any> {
    const updated = await this.approvalQueueRepository.updateApprovalQueueItem(
      approvalQueueId,
      userId,
      data,
    );
    this.emitQueueUpdated(userId, 'workflow_updated');
    return updated;
  }

  private emitQueueUpdated(userId: string | null | undefined, reason: string): void {
    if (!userId) {
      return;
    }
    this.approvalQueueEventsService.emitQueueUpdated(userId, reason);
  }

  private async emitQueueUpdatedByApprovalQueueId(
    approvalQueueId: string | null | undefined,
    reason: string,
  ): Promise<void> {
    if (!approvalQueueId || !this.approvalQueueEventsService.hasAnyActiveSubscribers()) {
      return;
    }
    const userId =
      await this.approvalQueueRepository.findUserIdByApprovalQueueId(approvalQueueId);
    if (!userId || !this.approvalQueueEventsService.hasActiveSubscribers(userId)) {
      return;
    }
    this.approvalQueueEventsService.emitQueueUpdated(userId, reason);
  }

  private async emitQueueUpdatedByActionId(
    actionId: string | null | undefined,
    reason: string,
  ): Promise<void> {
    if (!actionId || !this.approvalQueueEventsService.hasAnyActiveSubscribers()) {
      return;
    }
    const action = await this.approvalQueueActionsRepository.findById(actionId);
    if (!action) {
      return;
    }
    await this.emitQueueUpdatedByApprovalQueueId(action.approvalQueueId, reason);
  }
}
