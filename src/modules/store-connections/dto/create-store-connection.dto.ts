import { IsString, IsBoolean, IsOptional, IsNumber, IsEnum, IsUrl } from 'class-validator';

export enum ConnectionMethod {
  OAUTH = 'oauth',
  API_KEY = 'api_key',
  MANUAL = 'manual',
}

export class CreateStoreConnectionDto {
  @IsOptional() 
  @IsString()
  userid: string;

  @IsString()
  platform: string;

  @IsString()
  store_name: string;

  @IsUrl()
  store_url: string;

  @IsOptional()
  @IsString()
  api_key?: string;

  @IsOptional()
  @IsString()
  api_secret?: string;

  @IsOptional()
  @IsEnum(ConnectionMethod)
  connection_method?: ConnectionMethod;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
