import { Module } from '@nestjs/common';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { PlansModule } from './modules/plans/plans.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { GoogleOauthModule } from './modules/google-oauth/google-oauth.module';
import { ContactUsModule } from './modules/contact-us/contact-us.module';

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
    ContactUsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
