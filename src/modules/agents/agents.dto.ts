import {
  ArrayNotEmpty,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { Transform, Type } from 'class-transformer';
import {
  promoCodeDiscountTypes,
  promoCodeUsageTypes,
  PromoCodeUsageType,
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
  @Transform(({ value }) => {
    if (value === undefined || value === null) return value;
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(promoCodeUsageTypes, { each: true })
  usageType?: (typeof promoCodeUsageTypes)[number][];

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
  @Transform(({ value }) => (value === '' ? null : value))
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
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
  @Transform(({ value }) => {
    if (value === undefined || value === null) return value;
    return Array.isArray(value) ? value : [value];
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(promoCodeUsageTypes, { each: true })
  usageType?: (typeof promoCodeUsageTypes)[number][];

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
  @Transform(({ value }) => (value === '' ? null : value))
  @IsDateString()
  validFrom?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
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

export interface PromoCodeConfigurationResponse {
  id: string;
  userId: string;
  promoCode: string;
  description: string | null;
  isActive: boolean;
  usageType: PromoCodeUsageType[];
  discountType: string;
  discountPercentage: string | null;
  maxRefundAmount: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  minimumOrderValue: string | null;
  maxUsageCount: number | null;
  appliesToSubscriptions: boolean;
  wooCommerceCouponId: number | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  wcRestrictionsRaw: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

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
