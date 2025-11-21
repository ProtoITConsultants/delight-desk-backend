import { Module } from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';
import { WooCommerceController } from './woocommerce.controller';
import { UserStoreConnectionsRepository } from '../woocommerce-oauth/user-store-connections.repository';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [WooCommerceController],
  providers: [WooCommerceService, UserStoreConnectionsRepository],
  exports: [WooCommerceService],
})
export class WooCommerceModule {}
