
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export enum FulfillmentMethod {
  SELF = 'self',
  CUSTOM_WAREHOUSE = 'custom_warehouse',
  SHIPBOB = 'shipbob',
  SHIPSTATION = 'shipstation',
}

export class SetFulfillmentMethodDto {
  @IsEnum(FulfillmentMethod)
  method: FulfillmentMethod;

  @IsOptional()
  @IsEmail()
  warehouseEmail?: string;

  @IsOptional()
  @IsString()
  shipbobPersonalAccessToken?: string;

  @IsOptional()
  @IsString()
  shipstationApiKey?: string;
}
