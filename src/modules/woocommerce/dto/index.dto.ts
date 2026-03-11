import { IsNotEmpty, IsOptional, IsString, IsUrl, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializeWooOAuthDto {
  @ApiProperty({ description: 'WooCommerce store URL (must be HTTPS)', example: 'https://mystore.com' })
  @IsNotEmpty()
  @IsUrl({}, { message: 'storeUrl must be a valid HTTPS URL' })
  storeUrl: string;
}

export class ManualConnectWooDto {
  @ApiProperty({ description: 'WooCommerce store URL (must be HTTPS)', example: 'https://mystore.com' })
  @IsNotEmpty()
  @IsUrl({}, { message: 'storeUrl must be a valid HTTPS URL' })
  storeUrl: string;

  @ApiProperty({ description: 'WooCommerce API consumer key', example: 'ck_1234567890abcdef' })
  @IsNotEmpty()
  @IsString()
  consumerKey: string;

  @ApiProperty({ description: 'WooCommerce API consumer secret', example: 'cs_1234567890abcdef' })
  @IsNotEmpty()
  @IsString()
  consumerSecret: string;
}

export class GetOrdersQueryDto {
  @ApiPropertyOptional({
    description: 'Filter orders by WooCommerce status (e.g. pending, processing, completed, cancelled)',
    example: 'processing',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination', example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of orders per page',
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
  perPage?: number = 20;
}
