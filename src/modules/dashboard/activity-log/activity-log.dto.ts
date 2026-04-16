import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, Min } from 'class-validator';
import { ActivityLogStatus } from './activity-log.types';

export class GetActivityLogDto {
  @ApiPropertyOptional({
    description:
      'Filter by UI status bucket. Maps to the colored chips shown on the Activity Log card.',
    enum: ActivityLogStatus,
    example: ActivityLogStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(ActivityLogStatus)
  status?: ActivityLogStatus;

  @ApiPropertyOptional({
    description: 'Page number for pagination (1-indexed).',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page.',
    example: 20,
    minimum: 1,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}

export class ActivityLogItemDto {
  @ApiProperty({
    description: 'Stable identifier for this activity entry (the underlying action id).',
    example: 'b3a2f1ce-9c1e-4b8a-9f32-6a1c0b2b8de4',
  })
  id!: string;

  @ApiProperty({
    description: 'Status bucket for the UI chip.',
    enum: ActivityLogStatus,
    example: ActivityLogStatus.COMPLETED,
  })
  status!: ActivityLogStatus;

  @ApiProperty({
    description: 'Raw underlying action status (for audit/debug; do not show directly in UI).',
    example: 'executed',
  })
  rawStatus!: string;

  @ApiProperty({
    description: 'Human-readable headline for the activity row.',
    example: 'AI successfully found order 19044 for customer rcmartin2525@gmail.com.',
  })
  message!: string;

  @ApiProperty({
    description: 'Short name of the action type (falls back to action type when not set).',
    example: 'Fetch Order Details',
  })
  actionName!: string;

  @ApiProperty({
    description: 'Customer email associated with the workflow this activity belongs to.',
    example: 'rcmartin2525@gmail.com',
    nullable: true,
  })
  customerEmail!: string | null;

  @ApiProperty({
    description: 'Name of the AI agent that handled this workflow (wismo, order_cancellation, ...).',
    example: 'order_cancellation',
    nullable: true,
  })
  agentName!: string | null;

  @ApiProperty({
    description: 'Timestamp of the most recent state change for this activity (ISO).',
    example: '2026-04-17T00:02:50.123Z',
  })
  timestamp!: string;
}

export class ActivityLogPaginationDto {
  @ApiProperty({ example: 1 })
  currentPage!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: 42 })
  totalItems!: number;

  @ApiProperty({ example: 20 })
  itemsPerPage!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

export class ActivityLogResponseDto {
  @ApiProperty({ type: [ActivityLogItemDto] })
  data!: ActivityLogItemDto[];

  @ApiProperty({ type: ActivityLogPaginationDto })
  pagination!: ActivityLogPaginationDto;
}
