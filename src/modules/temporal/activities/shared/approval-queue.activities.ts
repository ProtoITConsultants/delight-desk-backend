import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ApprovalQueueRepository } from 'src/database/repos/approval-queue.repository';
import { ApprovalQueueActionsRepository } from 'src/database/repos/approval-queue-actions.repository';

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
    // #region agent log
    fetch('http://127.0.0.1:7417/ingest/1b01cce3-7c7a-45b0-90d3-394286ccf426', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '2163c6' },
      body: JSON.stringify({
        sessionId: '2163c6',
        location: 'approval-queue.activities.ts:21',
        message: 'createApprovalQueueItem data keys',
        data: {
          keys: Object.keys(data || {}),
          hasAgentType: 'agentType' in (data || {}),
          hasAgentName: 'agentName' in (data || {}),
          agentTypeValue: (data || {}).agentType,
          agentNameValue: (data || {}).agentName,
        },
        runId: 'post-fix',
        hypothesisId: 'H-A',
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
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

  @ActivityMethod({ name: 'updateApprovalQueueItem' })
  async updateApprovalQueueItem(
    approvalQueueId: string,
    userId: string,
    data: Partial<any>,
  ): Promise<any> {
    return this.approvalQueueRepository.updateApprovalQueueItem(approvalQueueId, userId, data);
  }
}
