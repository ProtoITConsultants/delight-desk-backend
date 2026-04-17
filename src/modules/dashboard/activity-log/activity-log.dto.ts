
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, Min } from 'class-validator';
import { ActivityLogStatus } from './activity-log.types';

export class GetActivityLogDto {
  @IsOptional()
  @IsEnum(ActivityLogStatus)
  status?: ActivityLogStatus;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}

export class ActivityLogItemDto {
  id!: string;

  status!: ActivityLogStatus;

  rawStatus!: string;

  message!: string;

  actionName!: string;

  customerEmail!: string | null;

  agentName!: string | null;

  timestamp!: string;
}

export class ActivityLogPaginationDto {
  currentPage!: number;

  totalPages!: number;

  totalItems!: number;

  itemsPerPage!: number;

  hasNextPage!: boolean;

  hasPreviousPage!: boolean;
}

export class ActivityLogResponseDto {
  data!: ActivityLogItemDto[];

  pagination!: ActivityLogPaginationDto;
}
