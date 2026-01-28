import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
