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

export class IngestManualProductKnowledgeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title: string;

  @IsString()
  @MinLength(20)
  @MaxLength(100000)
  content: string;
}

export class IngestUrlProductKnowledgeDto {
  @IsString()
  @IsUrl({ require_protocol: true })
  url: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  title?: string;
}

export class ListProductKnowledgeSourcesDto {
  @IsOptional()
  @IsString()
  status?: 'processing' | 'ready' | 'failed';
}

export class RetrieveProductKnowledgeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  query: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  topK?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minSimilarity?: number;

  @IsOptional()
  @IsNumber()
  @Min(200)
  @Max(4000)
  maxTokens?: number;
}
