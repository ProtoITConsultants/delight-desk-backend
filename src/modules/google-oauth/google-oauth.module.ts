import { forwardRef, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './google.strategy';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthController } from './google-oauth.controller';
import { GoogleOauthRepository } from '../../database/repos/google-oauth.repository';
import { EmailPipelineModule } from '../email-pipeline/email-pipeline.module';
import { InfraModule } from '../email-pipeline/temporal/infra.module';
import { SendgridModule } from '../sendgrid/sendgrid.module';
import { RepositoriesModule } from '../../database/repositories.module';
import { TokenHealthService } from './token-health.service';

// Services
import { GmailService } from './services/gmail.service';
import { GmailWebhookService } from './services/gmail-webhook.service';
import { EmailClassificationService } from './services/email-classification.service';

// Utilities
import { GmailParserUtil } from './utils/gmail-parser.util';
import { EmailContentExtractorUtil } from './utils/email-content-extractor.util';
import { GmailMessageBuilder } from './utils/gmail-message.builder';

@Module({
  imports: [
    PassportModule.register({ session: true }),
    InfraModule,
    SendgridModule,
    RepositoriesModule,
    forwardRef(() => EmailPipelineModule),
  ],
  controllers: [GoogleOauthController],
  providers: [
    // Core OAuth service
    GoogleOauthService,
    GoogleOauthRepository,
    GoogleStrategy,
    TokenHealthService,

    // Gmail services
    GmailService,
    GmailWebhookService,
    EmailClassificationService,

    // Utilities
    GmailParserUtil,
    EmailContentExtractorUtil,
    GmailMessageBuilder,
  ],
  exports: [GoogleOauthService],
})
export class GoogleOauthModule {}
