import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserAgentDto {
  @ApiPropertyOptional({ description: 'Enable or disable the agent', example: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Require human moderation before sending agent responses', example: true })
  @IsOptional()
  @IsBoolean()
  requiresModeration?: boolean;
}

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional({ description: 'Indicates if WooCommerce store has tracking plugin installed', example: true })
  @IsOptional()
  @IsBoolean()
  hasTrackingPluginForWoocommerce?: boolean;
}

export class WismoPreviewDto {
  @ApiProperty({ description: 'Order number or customer email to preview WISMO response', example: '12345' })
  @IsString()
  @IsNotEmpty({ message: 'Query is required (order number or customer email)' })
  query: string;
}

export interface WismoPreviewResponse {
  from: string;
  to: string;
  subject: string;
  body: string;
  signature: string;
  orderDetails?: {
    orderId: string;
    status: string;
    trackingNumber?: string;
  };
  hasTracking: boolean;
}

export class ProductPreviewDto {
  @ApiProperty({
    description: 'Customer question to preview Product Agent response',
    example: 'Is this magnesium supplement safe to take with coffee?',
  })
  @IsString()
  @IsNotEmpty({ message: 'Question is required' })
  @MaxLength(3000, { message: 'Question is too long (max 3000 characters)' })
  question: string;

  @ApiPropertyOptional({
    description: 'Optional customer name for greeting simulation',
    example: 'Sarah',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @ApiPropertyOptional({
    description: 'Optional customer email for simulation context',
    example: 'sarah@example.com',
  })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}

export type ProductPreviewStatus = 'generated' | 'blocked' | 'needs_moderation';

export type ProductPreviewBlockReason =
  | 'agent_disabled'
  | 'non_product_intent'
  | 'low_classification_confidence'
  | 'escalation_scenario'
  | 'no_product_knowledge'
  | 'low_similarity'
  | 'insufficient_context_tokens';

export interface ProductPreviewResponse {
  status: ProductPreviewStatus;
  moderationRequired: boolean;
  responseText?: string;
  blockReason?: ProductPreviewBlockReason;
  classification: {
    category: string;
    confidence: number;
    scenarios: {
      escalation: boolean;
      thankful: boolean;
    };
  };
  retrieval: {
    chunkCount: number;
    topSimilarity: number | null;
    usedTokens: number;
    totalMatches: number;
    skippedBySimilarity: number;
    skippedByTokenBudget: number;
  };
}
