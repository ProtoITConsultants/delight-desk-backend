import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateWooCommerceOAuthDto {
  @IsNotEmpty()
  @IsUrl()
  storeUrl: string;

  @IsNotEmpty()
  @IsString()
  consumerKey: string;

  @IsNotEmpty()
  @IsString()
  consumerSecret: string;

  @IsNotEmpty()
  @IsString()
  storeName: string;
}
