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

import { Type } from 'class-transformer';
import {
  promoCodeDiscountTypes,
  promoCodeUsageTypes,
  PromoCodeConfigurationEntity,
} from 'src/database/schema';

export class UpdateUserAgentDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresModeration?: boolean;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsBoolean()
  hasTrackingPluginForWoocommerce?: boolean;
}

export class WismoPreviewDto {
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
  @IsString()
  @IsNotEmpty({ message: 'Query is required' })
  @MaxLength(3000, { message: 'Query is too long (max 3000 characters)' })
  query: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;
}

export type ProductPreviewResponse = WismoPreviewResponse;

export class CreatePromoCodeConfigurationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  promoCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(promoCodeUsageTypes)
  usageType?: (typeof promoCodeUsageTypes)[number];

  @IsOptional()
  @IsEnum(promoCodeDiscountTypes)
  discountType?: (typeof promoCodeDiscountTypes)[number];

  @IsOptional()
  @ValidateIf((dto) => dto.discountPercentage !== null && dto.discountPercentage !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountPercentage?: number | null;

  @IsOptional()
  @ValidateIf((dto) => dto.maxRefundAmount !== null && dto.maxRefundAmount !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxRefundAmount?: number | null;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @ValidateIf((dto) => dto.minimumOrderValue !== null && dto.minimumOrderValue !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumOrderValue?: number | null;

  @IsOptional()
  @ValidateIf((dto) => dto.maxUsageCount !== null && dto.maxUsageCount !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsageCount?: number | null;

  @IsOptional()
  @IsBoolean()
  appliesToSubscriptions?: boolean;
}

export class UpdatePromoCodeConfigurationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  promoCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(promoCodeUsageTypes)
  usageType?: (typeof promoCodeUsageTypes)[number];

  @IsOptional()
  @IsEnum(promoCodeDiscountTypes)
  discountType?: (typeof promoCodeDiscountTypes)[number];

  @IsOptional()
  @ValidateIf((dto) => dto.discountPercentage !== null && dto.discountPercentage !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountPercentage?: number | null;

  @IsOptional()
  @ValidateIf((dto) => dto.maxRefundAmount !== null && dto.maxRefundAmount !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxRefundAmount?: number | null;

  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @ValidateIf((dto) => dto.minimumOrderValue !== null && dto.minimumOrderValue !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minimumOrderValue?: number | null;

  @IsOptional()
  @ValidateIf((dto) => dto.maxUsageCount !== null && dto.maxUsageCount !== undefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUsageCount?: number | null;

  @IsOptional()
  @IsBoolean()
  appliesToSubscriptions?: boolean;
}

export type PromoCodeConfigurationResponse = PromoCodeConfigurationEntity;

/**
 * Query parameters for listing promo code configurations. Mirrors the pagination
 * shape used by the approval queue and other list endpoints so frontend list views
 * can reuse the same hooks.
 */
export class ListPromoCodeConfigurationsDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 20;
}

export interface PaginatedPromoCodeConfigurationsResponse {
  data: PromoCodeConfigurationResponse[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
