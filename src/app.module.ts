import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BillingModule } from './modules/billing/billing.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ContactUsModule } from './modules/contact-us/contact-us.module';
import { WooCommerceModule } from './modules/woocommerce/woocommerce.module';
import { GoogleOauthModule } from './modules/google-oauth/google-oauth.module';
import { MicrosoftOauthModule } from './modules/microsoft-oauth/microsoft-oauth.module';
import { WooCommerceOAuthModule } from './modules/woocommerce-oauth/woocommerce-oauth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    UsersModule,
    BillingModule,
    AccountsModule,
    ContactUsModule,
    GoogleOauthModule,
    WooCommerceModule,
    MicrosoftOauthModule,
    WooCommerceOAuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
