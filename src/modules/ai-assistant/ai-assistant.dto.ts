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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetEscalationsDto {
  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by escalation status (comma-separated)',
    example: 'pending,progress',
    enum: ['pending', 'progress', 'resolved'],
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(['pending', 'progress', 'resolved'], { each: true })
  status?: ('pending' | 'progress' | 'resolved')[];

  @ApiPropertyOptional({
    description: 'Filter by priority level (comma-separated)',
    example: 'high,urgent',
    enum: ['low', 'medium', 'high', 'urgent'],
    isArray: true,
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsEnum(['low', 'medium', 'high', 'urgent'], { each: true })
  priority?: ('low' | 'medium' | 'high' | 'urgent')[];

  @ApiPropertyOptional({
    description: 'Sort field',
    example: 'createdAt',
    enum: ['createdAt', 'resolvedAt', 'priority'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsEnum(['createdAt', 'resolvedAt', 'priority'])
  sortBy?: 'createdAt' | 'resolvedAt' | 'priority' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'desc',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({
    description: 'Search term to filter escalations',
    example: 'order issue',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class UpdateEscalationStatusDto {
  @ApiProperty({
    description: 'New status for the escalation',
    example: 'progress',
    enum: ['pending', 'progress', 'resolved'],
  })
  @IsEnum(['pending', 'progress', 'resolved'])
  status: 'pending' | 'progress' | 'resolved';

  @ApiPropertyOptional({
    description: 'Additional notes about the status update',
    example: 'Working on resolving this issue',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class BulkUpdateEscalationStatusDto {
  @ApiProperty({
    description: 'Array of escalation IDs to update (1-50 items)',
    example: ['123e4567-e89b-12d3-a456-426614174000'],
    type: [String],
    minItems: 1,
    maxItems: 50,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  escalationIds: string[];

  @ApiProperty({
    description: 'New status for all escalations',
    example: 'resolved',
    enum: ['pending', 'progress', 'resolved'],
  })
  @IsEnum(['pending', 'progress', 'resolved'])
  status: 'pending' | 'progress' | 'resolved';

  @ApiPropertyOptional({
    description: 'Additional notes for all status updates',
    example: 'Bulk resolved customer issues',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class GetEscalationStatsDto {
  @ApiPropertyOptional({
    description: 'Start date for stats filtering (ISO 8601 format)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'End date for stats filtering (ISO 8601 format)',
    example: '2024-12-31',
  })
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
  @ApiPropertyOptional({
    description: 'Full name for email signature',
    example: 'John Doe',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Job title',
    example: 'Customer Support Manager',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ description: 'Company name', example: 'DelightDesk Inc.', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @ApiPropertyOptional({ description: 'Company website URL', example: 'https://delightdesk.com' })
  @IsOptional()
  @IsUrl()
  companyUrl?: string;

  @ApiPropertyOptional({
    description: 'Contact email address',
    example: 'john.doe@delightdesk.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+1-555-123-4567',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;
}

export class UpdateHtmlSignatureDto {
  @ApiProperty({
    description: 'Custom HTML email signature',
    example: '<p>Best regards,<br/>John Doe</p>',
    maxLength: 10000,
  })
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
  @ApiProperty({
    description: 'Email message content to send as response',
    example: 'Thank you for contacting us. Your issue has been resolved.',
    maxLength: 10000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message: string;

  @ApiPropertyOptional({
    description: 'Whether to include email signature in the response',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeEmailSignature?: boolean = true;
}

// Generate AI Response DTO
export class GenerateAiResponseDto {
  @ApiProperty({
    description: 'Instruction for AI to generate a custom response',
    example: 'Generate a friendly response apologizing for the delay',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  instruction: string;
}

export interface GenerateAiResponseResponse {
  response: string;
}
