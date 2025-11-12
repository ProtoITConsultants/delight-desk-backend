import { Module } from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';
import { WooCommerceController } from './woocommerce.controller';
import { StoreConnectionsModule } from '../store-connections/store-connections.module';

@Module({
  imports: [StoreConnectionsModule], 
  controllers: [WooCommerceController],
  providers: [WooCommerceService],
  exports: [WooCommerceService,], // allows reuse in other modules if needed
})
export class WooCommerceModule {}
