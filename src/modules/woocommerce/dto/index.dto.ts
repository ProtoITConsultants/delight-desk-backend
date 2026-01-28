import { IsNotEmpty, IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
