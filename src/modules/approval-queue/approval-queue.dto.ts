import { IsArray, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetApprovalQueueDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['pending', 'in_progress', 'cancelled', 'escalated', 'completed'],
    example: 'pending',
  })
  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'cancelled', 'escalated', 'completed'], { each: true })
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by agent type', example: 'wismo' })
  @IsOptional()
  @IsString()
  category?: string;

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

export class CancelWorkflowDto {
  @ApiProperty({
    description: 'Temporal workflow ID to cancel',
    example: 'workflow-thread-abc123',
  })
  @IsNotEmpty()
  @IsString()
  workflowId: string;
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

export interface ApprovalQueueStatsResponse {
  total: number;
  pending: number;
  inProgress: number;
  escalated: number;
  cancelled: number;
  completed: number;
}
