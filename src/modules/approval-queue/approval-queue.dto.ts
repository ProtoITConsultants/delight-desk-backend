import { IsArray, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetApprovalQueueDto {
  @IsOptional()
  @IsEnum(['pending', 'approved', 'rejected', 'edited', 'executed'], { each: true })
  status?: string;

  @IsOptional()
  @IsString()
  agentType?: string;

  @IsOptional()
  @IsArray()
  @IsIn(['low', 'medium', 'high', 'urgent'], { each: true })
  priority?: string[];

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}

export class ApproveItemDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectItemDto {
  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class EditAndApproveDto {
  @IsNotEmpty()
  @IsString()
  editedResponse: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export interface ApprovalQueueItemResponse {
  id: string;
  userId: string;
  emailId: string;
  threadId: string;
  workflowId: string;
  workflowRunId: string;
  status: string;
  agentType: string;
  customerEmail: string;
  customerName?: string;
  emailSubject: string;
  emailBody: string;
  category: string;
  confidence?: string;
  priority: string;
  sentiment?: string;
  proposedResponse: string;
  editedResponse?: string;
  workflowMetadata?: any;
  plannedSteps?: any;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  reviewNotes?: string;
  executedAt?: Date;
  executionResult?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalQueueListResponse {
  data: ApprovalQueueItemResponse[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ApprovalQueueDetailResponse extends ApprovalQueueItemResponse {
  email?: {
    id: string;
    subject: string;
    fromEmail: string;
    snippet: string;
  };
  thread?: {
    id: string;
    threadId: string;
  };
  activityLog?: ActivityLogEntry[];
}

export interface ActivityLogEntry {
  id: string;
  approvalQueueId: string;
  userId?: string;
  action: string;
  description: string;
  metadata?: any;
  createdAt: Date;
}

export interface ApprovalQueueStatsResponse {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  executed: number;
}
