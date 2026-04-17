import { forwardRef, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MicrosoftStrategy } from './microsoft.strategy';
import { DatabaseModule } from 'src/database/database.module';
import { MicrosoftOauthService } from './microsoft-oauth.service';
import { MicrosoftOauthController } from './microsoft-oauth.controller';
import { MicrosoftOauthRepository } from '../../database/repos/microsoft-oauth.repository';
import { OutlookWebhookService } from './services/outlook-webhook.service';
import { RepositoriesModule } from '../../database/repositories.module';
import { InfraModule } from '../temporal/infra.module';
import { AiAssistantEventsModule } from '../ai-assistant/ai-assistant-events.module';

// Shared email utilities reused from the Google OAuth module (no Google-specific deps)
import { EmailClassificationService } from '../google-oauth/services/email-classification.service';
import { EmailContentExtractorUtil } from '../google-oauth/utils/email-content-extractor.util';

@Module({
  imports: [
    PassportModule.register({ session: true }),
    DatabaseModule,
    RepositoriesModule,
    AiAssistantEventsModule,
    forwardRef(() => InfraModule),
  ],
  controllers: [MicrosoftOauthController],
  providers: [
    MicrosoftOauthService,
    MicrosoftOauthRepository,
    MicrosoftStrategy,
    OutlookWebhookService,
    EmailClassificationService,
    EmailContentExtractorUtil,
  ],
  exports: [MicrosoftOauthService, OutlookWebhookService],
})
export class MicrosoftOauthModule {}
