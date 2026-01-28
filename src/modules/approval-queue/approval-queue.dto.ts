import { IsArray, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetApprovalQueueDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['pending', 'approved', 'rejected', 'edited', 'executed'],
    example: 'pending',
  })
  @IsOptional()
  @IsEnum(['pending', 'approved', 'rejected', 'edited', 'executed'], { each: true })
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by agent type', example: 'wismo' })
  @IsOptional()
  @IsString()
  agentType?: string;

  @ApiPropertyOptional({
    description: 'Filter by priority levels',
    type: [String],
    enum: ['low', 'medium', 'high', 'urgent'],
    example: ['high', 'urgent'],
  })
  @IsOptional()
  @IsArray()
  @IsIn(['low', 'medium', 'high', 'urgent'], { each: true })
  priority?: string[];

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}

export class RejectItemDto {
  @ApiProperty({
    description: 'Reason for rejection',
    example: 'Response tone is too formal for our brand',
  })
  @IsNotEmpty()
  @IsString()
  reason: string;

  @ApiPropertyOptional({
    description: 'Additional notes for rejection',
    example: 'Please regenerate with a friendlier tone',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class EditAndApproveDto {
  @ApiProperty({
    description: 'Edited version of the proposed response',
    example: 'Hi there! Your order #12345 is on its way...',
  })
  @IsNotEmpty()
  @IsString()
  editedResponse: string;

  @ApiPropertyOptional({
    description: 'Additional notes for the edit',
    example: 'Updated to match brand voice',
  })
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
  inProgress: number;
  completed: number;
  escalated: number;
}
