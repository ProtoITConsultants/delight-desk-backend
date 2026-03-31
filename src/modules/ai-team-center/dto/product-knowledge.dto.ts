import {
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IngestManualProductKnowledgeDto {
  @ApiProperty({
    description: 'Title for the manual knowledge source',
    example: 'Size Guide for Running Shoes',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title: string;

  @ApiProperty({
    description: 'Manual content that should be ingested and indexed for retrieval',
    example:
      'Our running shoes fit true to size for most customers. For wide feet, pick one half size up.',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(100000)
  content: string;
}

export class IngestUrlProductKnowledgeDto {
  @ApiProperty({
    description: 'Website URL to ingest (single page only in v1)',
    example: 'https://example.com/products/running-shoe-pro',
  })
  @IsString()
  @IsUrl({ require_protocol: true })
  url: string;

  @ApiPropertyOptional({
    description: 'Optional title override for the URL source',
    example: 'Running Shoe Pro Specs Page',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title?: string;
}

export class ListProductKnowledgeSourcesDto {
  @ApiPropertyOptional({
    description: 'Optional source status filter',
    example: 'ready',
    enum: ['processing', 'ready', 'failed'],
  })
  @IsOptional()
  @IsString()
  status?: 'processing' | 'ready' | 'failed';
}

export class RetrieveProductKnowledgeDto {
  @ApiProperty({
    description: 'User query for retrieving relevant product knowledge chunks',
    example: 'Is this charger compatible with iPhone 15?',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  query: string;

  @ApiPropertyOptional({
    description: 'Number of chunks to retrieve before token budgeting',
    example: 8,
    default: 8,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @ApiPropertyOptional({
    description: 'Minimum similarity threshold from 0 to 1',
    example: 0.72,
    default: 0.65,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minSimilarity?: number;

  @ApiPropertyOptional({
    description: 'Maximum token budget for assembled retrieval context',
    example: 1200,
    default: 1200,
    minimum: 200,
    maximum: 4000,
  })
  @IsOptional()
  @IsNumber()
  @Min(200)
  @Max(4000)
  maxTokens?: number;
}
