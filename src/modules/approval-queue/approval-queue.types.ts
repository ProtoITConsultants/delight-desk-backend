import type { ApprovalQueueActionEntity } from '../../database/schema';

export interface ApprovalQueueStatsResponse {
  total: number;
  pending: number;
  inProgress: number;
  escalated: number;
  cancelled: number;
  completed: number;
}

export type ProgressFulfillmentMethod =
  | 'self'
  | 'custom_warehouse'
  | 'shipstation'
  | 'shipbob'
  | 'unknown';

export type ApprovalProgressStageStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'cancelled';

export interface ApprovalProgressStage {
  key: string;
  label: string;
  order: number;
  status: ApprovalProgressStageStatus;
  actionTypes: string[];
  actionSteps: string[];
}

export interface ApprovalQueueActionProgressResponse {
  approvalQueueId: string;
  workflowId: string;
  category: string | null;
  workflowStatus: string;
  fulfillmentMethod: ProgressFulfillmentMethod;
  currentStep: ApprovalProgressStage | null;
  nextSteps: ApprovalProgressStage[];
  timeline: ApprovalProgressStage[];
}

export type StageBlueprint = Omit<ApprovalProgressStage, 'status' | 'actionSteps'>;

export type QueueAction = ApprovalQueueActionEntity;

export type QueueSummary = {
  id: string;
  workflowId: string;
  category: string | null;
  status: string;
};
