import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserAgentDto {
  @ApiPropertyOptional({ description: 'Enable or disable the agent', example: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Require human moderation before sending agent responses',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  requiresModeration?: boolean;
}

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional({
    description: 'Indicates if WooCommerce store has tracking plugin installed',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  hasTrackingPluginForWoocommerce?: boolean;
}

export class WismoPreviewDto {
  @ApiProperty({
    description: 'Order number or customer email to preview WISMO response',
    example: '12345',
  })
  @IsString()
  @IsNotEmpty({ message: 'Query is required (order number or customer email)' })
  query: string;
}

export interface WismoPreviewResponse {
  from: string;
  to: string;
  subject: string;
  body: string;
}

export class ProductPreviewDto {
  @ApiProperty({
    description: 'Customer query to preview Product Agent response',
    example: 'Is this magnesium supplement safe to take with coffee?',
  })
  @IsString()
  @IsNotEmpty({ message: 'Query is required' })
  @MaxLength(3000, { message: 'Query is too long (max 3000 characters)' })
  query: string;

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

export type ProductPreviewResponse = WismoPreviewResponse;
