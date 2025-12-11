import { Module } from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';
import { DatabaseModule } from 'src/database/database.module';
import { WooCommerceController } from './woocommerce.controller';
import { WooCommerceRestApiService } from './woocommerce-rest-api.service';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [WooCommerceController],
  providers: [WooCommerceService, UserStoreConnectionsRepository, WooCommerceRestApiService],
  exports: [WooCommerceService],
})
export class WooCommerceModule {}
