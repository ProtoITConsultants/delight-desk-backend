import { Module } from '@nestjs/common';
import { WooCommerceOAuthService } from './woocommerce-oauth.service';
import { WooCommerceOAuthController } from './woocommerce-oauth.controller';
import { StoreConnectionsRepository } from '../store-connections/store-connections.repository';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [WooCommerceOAuthController],
  providers: [WooCommerceOAuthService, StoreConnectionsRepository],
  exports: [WooCommerceOAuthService],
})
export class WooCommerceOAuthModule {}
