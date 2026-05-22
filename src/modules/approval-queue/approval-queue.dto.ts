import { IsEnum, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetApprovalQueueDto {
  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'cancelled', 'escalated', 'completed'], { each: true })
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}

export class GetWorkflowProgressItemsDto {
  @IsOptional()
  @IsString()
  category?: string = 'order_cancellation';

  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'cancelled', 'escalated', 'completed'], { each: true })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}

export class RejectItemDto {
  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelWorkflowDto {
  @IsOptional()
  @IsString()
  workflowId?: string;

  @IsOptional()
  @IsString()
  id?: string;
}

export class EditAndApproveDto {
  @IsNotEmpty()
  @IsString()
  editedResponse: string;
}
