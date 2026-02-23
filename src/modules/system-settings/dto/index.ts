import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export enum FulfillmentMethod {
  SELF = 'self',
  CUSTOM_WAREHOUSE = 'custom_warehouse',
  SHIPBOB = 'shipbob',
  SHIPSTATION = 'shipstation',
}

export class SetFulfillmentMethodDto {
  @ApiProperty({
    enum: FulfillmentMethod,
    description: 'The fulfillment method to use',
  })
  @IsEnum(FulfillmentMethod)
  method: FulfillmentMethod;

  @ApiPropertyOptional({ description: 'Email address for custom warehouse' })
  @IsOptional()
  @IsEmail()
  warehouseEmail?: string;

  @ApiPropertyOptional({ description: 'ShipBob Personal Access Token' })
  @IsOptional()
  @IsString()
  shipbobPersonalAccessToken?: string;

  @ApiPropertyOptional({ description: 'ShipStation API key' })
  @IsOptional()
  @IsString()
  shipstationApiKey?: string;
}
