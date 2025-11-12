import { Module } from '@nestjs/common';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PlansModule } from './modules/plans/plans.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { GoogleOauthModule } from './modules/google-oauth/google-oauth.module';
import { ContactUsModule } from './modules/contact-us/contact-us.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { MicrosoftOauthModule } from './modules/microsoft-oauth/microsoft-oauth.module';
import { WooCommerceModule } from './modules/woocommerce/woocommerce.module';
import { StoreConnectionsModule } from './modules/store-connections/store-connections.module';
import { WoocommerceOauthModule } from './modules/woocommerce-oauth/woocommerce-oauth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UsersModule,
    AuthModule,
    PlansModule,
    AccountsModule,
    GoogleOauthModule,
    MicrosoftOauthModule,
    ContactUsModule,
    ConnectionsModule,
    WooCommerceModule,
    StoreConnectionsModule,
    WoocommerceOauthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
