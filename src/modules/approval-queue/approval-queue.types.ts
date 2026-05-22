import type { ApprovalQueueActionEntity } from '../../database/schema';

export interface ApprovalQueueStatsResponse {
  total: number;
  pending: number;
  inProgress: number;
  requiresApproval: number;
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
}

export interface ApprovalQueueActionProgressResponse {
  fulfillmentMethod: ProgressFulfillmentMethod;
  currentStep: ApprovalProgressStage | null;
  timeline: ApprovalProgressStage[];
}

export interface WorkflowProgressListItem {
  id: string;
  status: string;
  category: string | null;
  customerEmail: string;
  customerName: string | null;
  orderNumber: string | null;
  createdAt: Date;
  actionProgress: ApprovalQueueActionProgressResponse | null;
}

export interface PaginatedWorkflowProgressResponse {
  data: WorkflowProgressListItem[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export type StageBlueprint = {
  key: string;
  label: string;
  order: number;
  actionTypes: string[];
};

export type QueueAction = ApprovalQueueActionEntity;

export type QueueSummary = {
  id: string;
  workflowId: string;
  category: string | null;
  status: string;
};
