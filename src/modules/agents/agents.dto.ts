import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  promoCodeDiscountTypes,
  promoCodeUsageTypes,
  PromoCodeConfigurationEntity,
} from 'src/database/schema';

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

export class CreatePromoCodeConfigurationDto {
  @ApiProperty({
    description: 'Promo code value used in storefront checkout',
    example: 'SAVE20',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  promoCode: string;

  @ApiPropertyOptional({
    description: 'Optional internal description for support and moderation context',
    example: '20% off all orders',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Enable or disable this promo code automation rule',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'When this promo code should be offered by the agent',
    enum: promoCodeUsageTypes,
    default: 'first_time_customer_discount',
  })
  @IsOptional()
  @IsEnum(promoCodeUsageTypes)
  usageType?: (typeof promoCodeUsageTypes)[number];

  @ApiPropertyOptional({
    description: 'Discount calculation mode',
    enum: promoCodeDiscountTypes,
    default: 'percentage',
  })
  @IsOptional()
  @IsEnum(promoCodeDiscountTypes)
  discountType?: (typeof promoCodeDiscountTypes)[number];

  @ApiPropertyOptional({
    description: 'Discount percentage when discount type is percentage',
    example: 20,
    minimum: 0,
  })
  @IsOptional()
  @ValidateIf((dto) => dto.discountPercentage !== null && dto.discountPercentage !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountPercentage?: number | null;

  @ApiPropertyOptional({
    description: 'Optional cap for refunds/discount amount in store currency',
    example: 50,
    minimum: 0,
  })
  @IsOptional()
  @ValidateIf((dto) => dto.maxRefundAmount !== null && dto.maxRefundAmount !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxRefundAmount?: number | null;

  @ApiPropertyOptional({
    description: 'Start of promo validity window (ISO timestamp)',
    example: '2026-04-14T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @ApiPropertyOptional({
    description: 'End of promo validity window (ISO timestamp)',
    example: '2026-05-14T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @ApiPropertyOptional({
    description: 'Optional minimum order value required to use this promo',
    example: 10,
    minimum: 0,
  })
  @IsOptional()
  @ValidateIf((dto) => dto.minimumOrderValue !== null && dto.minimumOrderValue !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumOrderValue?: number | null;

  @ApiPropertyOptional({
    description: 'Optional usage cap for this promo code',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @ValidateIf((dto) => dto.maxUsageCount !== null && dto.maxUsageCount !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsageCount?: number | null;

  @ApiPropertyOptional({
    description: 'Whether this promo code can be used for subscription orders',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  appliesToSubscriptions?: boolean;
}

export class UpdatePromoCodeConfigurationDto {
  @ApiPropertyOptional({
    description: 'Promo code value used in storefront checkout',
    example: 'SAVE20',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  promoCode?: string;

  @ApiPropertyOptional({
    description: 'Optional internal description for support and moderation context',
    example: '20% off all orders',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Enable or disable this promo code automation rule',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'When this promo code should be offered by the agent',
    enum: promoCodeUsageTypes,
  })
  @IsOptional()
  @IsEnum(promoCodeUsageTypes)
  usageType?: (typeof promoCodeUsageTypes)[number];

  @ApiPropertyOptional({
    description: 'Discount calculation mode',
    enum: promoCodeDiscountTypes,
  })
  @IsOptional()
  @IsEnum(promoCodeDiscountTypes)
  discountType?: (typeof promoCodeDiscountTypes)[number];

  @ApiPropertyOptional({
    description: 'Discount percentage when discount type is percentage',
    example: 20,
    minimum: 0,
  })
  @IsOptional()
  @ValidateIf((dto) => dto.discountPercentage !== null && dto.discountPercentage !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountPercentage?: number | null;

  @ApiPropertyOptional({
    description: 'Optional cap for refunds/discount amount in store currency',
    example: 50,
    minimum: 0,
  })
  @IsOptional()
  @ValidateIf((dto) => dto.maxRefundAmount !== null && dto.maxRefundAmount !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxRefundAmount?: number | null;

  @ApiPropertyOptional({
    description: 'Start of promo validity window (ISO timestamp)',
    example: '2026-04-14T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @ApiPropertyOptional({
    description: 'End of promo validity window (ISO timestamp)',
    example: '2026-05-14T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @ApiPropertyOptional({
    description: 'Optional minimum order value required to use this promo',
    example: 10,
    minimum: 0,
  })
  @IsOptional()
  @ValidateIf((dto) => dto.minimumOrderValue !== null && dto.minimumOrderValue !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumOrderValue?: number | null;

  @ApiPropertyOptional({
    description: 'Optional usage cap for this promo code',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @ValidateIf((dto) => dto.maxUsageCount !== null && dto.maxUsageCount !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsageCount?: number | null;

  @ApiPropertyOptional({
    description: 'Whether this promo code can be used for subscription orders',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  appliesToSubscriptions?: boolean;
}

export type PromoCodeConfigurationResponse = PromoCodeConfigurationEntity;
