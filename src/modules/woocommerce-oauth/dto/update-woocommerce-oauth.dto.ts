import { PartialType } from '@nestjs/mapped-types';
import { CreateWooCommerceOAuthDto } from './create-woocommerce-oauth.dto';

export class UpdateWoocommerceOauthDto extends PartialType(CreateWooCommerceOAuthDto) {}
