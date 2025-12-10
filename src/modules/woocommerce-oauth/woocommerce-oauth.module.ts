import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { WooCommerceOAuthService } from './woocommerce-oauth.service';
import { WooCommerceOAuthController } from './woocommerce-oauth.controller';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [WooCommerceOAuthController],
  providers: [WooCommerceOAuthService, UserStoreConnectionsRepository],
  exports: [WooCommerceOAuthService],
})
export class WooCommerceOAuthModule {}
