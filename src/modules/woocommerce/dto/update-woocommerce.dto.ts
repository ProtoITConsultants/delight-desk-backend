import { PartialType } from '@nestjs/mapped-types';
import { CreateWoocommerceDto } from './create-woocommerce.dto';

export class UpdateWoocommerceDto extends PartialType(CreateWoocommerceDto) {}
