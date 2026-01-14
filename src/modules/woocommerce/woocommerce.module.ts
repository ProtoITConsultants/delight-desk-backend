import { Module } from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';
import { DatabaseModule } from 'src/database/database.module';
import { WooCommerceController } from './woocommerce.controller';
import { WooCommerceRestApiService } from './woocommerce-rest-api.service';
import { RepositoriesModule } from '../../database/repositories.module';

@Module({
  imports: [DatabaseModule, RepositoriesModule],
  controllers: [WooCommerceController],
  providers: [WooCommerceService, WooCommerceRestApiService],
  exports: [WooCommerceService, WooCommerceRestApiService],
})
export class WooCommerceModule {}
