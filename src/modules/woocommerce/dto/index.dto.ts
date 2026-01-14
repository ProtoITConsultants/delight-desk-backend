import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

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
