import { IsNotEmpty, IsOptional, IsString, IsUrl, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class InitializeWooOAuthDto {
  @IsNotEmpty()
  @IsUrl({}, { message: 'storeUrl must be a valid HTTPS URL' })
  storeUrl: string;
}

export class ManualConnectWooDto {
  @IsNotEmpty()
  @IsUrl({}, { message: 'storeUrl must be a valid HTTPS URL' })
  storeUrl: string;

  @IsNotEmpty()
  @IsString()
  consumerKey: string;

  @IsNotEmpty()
  @IsString()
  consumerSecret: string;
}

export class GetOrdersQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perPage?: number = 20;
}
