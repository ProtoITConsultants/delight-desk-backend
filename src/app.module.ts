import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AgentsModule } from './modules/agents/agents.module';
import { BillingModule } from './modules/billing/billing.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ContactUsModule } from './modules/contact-us/contact-us.module';
import { WooCommerceModule } from './modules/woocommerce/woocommerce.module';
import { GoogleOauthModule } from './modules/google-oauth/google-oauth.module';
import { AiAssistantModule } from './modules/ai-assistant/ai-assistant.module';
import { ApprovalQueueModule } from './modules/approval-queue/approval-queue.module';
import { MicrosoftOauthModule } from './modules/microsoft-oauth/microsoft-oauth.module';
import { AiTeamCenterModule } from './modules/ai-team-center/ai-team-center.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    AgentsModule,
    BillingModule,
    AccountsModule,
    ContactUsModule,
    WooCommerceModule,
    GoogleOauthModule,
    MicrosoftOauthModule,
    ApprovalQueueModule,
    AiAssistantModule,
    AiTeamCenterModule,
    SystemSettingsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
