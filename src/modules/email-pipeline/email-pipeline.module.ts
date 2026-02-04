import { forwardRef, Module } from '@nestjs/common';
import { EmailPipelineService } from './email-pipeline.service';
import { InfraModule } from './temporal/infra.module';
import { RepositoriesModule } from '../../database/repositories.module';
import { EmailPipelineController } from './email-pipeline.controller';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { AftershipModule } from '../aftership/aftership.module';
import { ClassificationUtil } from './utils/classification.util';
import { GoogleOauthModule } from '../google-oauth/google-oauth.module';
import { AgentsModule } from '../agents/agents.module';
import { OpenAIModule } from '../openai/openai.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';

// Shared activities
import { EmailActivities } from './temporal/activities/shared/email.activities';
import { ApprovalQueueActivities } from './temporal/activities/shared/approval-queue.activities';
import { EscalationActivities } from './temporal/activities/shared/escalation.activities';
import { AiIdentityActivities } from './temporal/activities/shared/ai-identity.activities';
import { MessageFormattingHelper } from './temporal/activities/shared/message-formatting.helper';

// WISMO-specific activities
import { WismoOrderActivities } from './temporal/activities/agents/wismo/wismo-order.activities';
import { WismoTrackingActivities } from './temporal/activities/agents/wismo/wismo-tracking.activities';
import { WismoMessageActivities } from './temporal/activities/agents/wismo/wismo-messages.activities';
import { SendgridModule } from '../sendgrid/sendgrid.module';

@Module({
  imports: [
    InfraModule,
    RepositoriesModule,
    WooCommerceModule,
    AftershipModule,
    AgentsModule,
    OpenAIModule,
    SendgridModule,
    forwardRef(() => AiAssistantModule),
    forwardRef(() => GoogleOauthModule),
  ],
  controllers: [EmailPipelineController],
  providers: [
    EmailPipelineService,
    ClassificationUtil,
    // Shared activities
    EmailActivities,
    ApprovalQueueActivities,
    EscalationActivities,
    AiIdentityActivities,
    MessageFormattingHelper,
    // WISMO-specific activities
    WismoOrderActivities,
    WismoTrackingActivities,
    WismoMessageActivities,
  ],
  exports: [EmailPipelineService],
})
export class EmailPipelineModule {}
