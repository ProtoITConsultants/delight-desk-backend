import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GetEscalationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(['pending', 'progress', 'resolved'], { each: true })
  status?: ('pending' | 'progress' | 'resolved')[];

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(['low', 'medium', 'high', 'urgent'], { each: true })
  priority?: ('low' | 'medium' | 'high' | 'urgent')[];

  @IsOptional()
  @IsEnum(['createdAt', 'resolvedAt', 'priority'])
  sortBy?: 'createdAt' | 'resolvedAt' | 'priority' = 'createdAt';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class UpdateEscalationStatusDto {
  @IsEnum(['pending', 'progress', 'resolved'])
  status: 'pending' | 'progress' | 'resolved';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class BulkUpdateEscalationStatusDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  escalationIds: string[];

  @IsEnum(['pending', 'progress', 'resolved'])
  status: 'pending' | 'progress' | 'resolved';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class GetEscalationStatsDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

// Response interfaces
export interface PaginationMetadata {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface EscalationListResponse {
  data: any[];
  pagination: PaginationMetadata;
}

export interface EscalationStatsResponse {
  total: number;
  byStatus: {
    pending: number;
    progress: number;
    resolved: number;
  };
  byPriority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
}

export interface BulkUpdateResult {
  success: boolean;
  updated: number;
  results: Array<{
    id: string;
    status: string;
    resolvedAt: Date | null;
  }>;
  skipped: Array<{
    id: string;
    reason: string;
  }>;
}

// Email Signature DTOs
export class UpdateStructuredSignatureDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @IsOptional()
  @IsUrl()
  companyUrl?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}

export class UpdateHtmlSignatureDto {
  @IsString()
  @MaxLength(10000)
  htmlSignature: string;
}

export interface EmailSignatureResponse {
  structured: {
    name: string | null;
    title: string | null;
    company: string | null;
    companyUrl: string | null;
    email: string | null;
    phoneNumber: string | null;
  };
  html: {
    htmlSignature: string | null;
  };
}

// Send Response DTO
export class SendEscalationResponseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message: string;

  @IsOptional()
  @IsBoolean()
  includeEmailSignature?: boolean = true;
}

// Generate AI Response DTO
export class GenerateAiResponseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  instruction: string;
}

export interface GenerateAiResponseResponse {
  response: string;
}
