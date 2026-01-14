import { Module } from '@nestjs/common';
import { EmailPipelineService } from './email-pipeline.service';
import { EmailActivities } from './temporal/activities/email.activities';
import { InfraModule } from './temporal/infra.module';
import { RepositoriesModule } from '../../database/repositories.module';
import { EmailPipelineController } from './email-pipeline.controller';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { AftershipModule } from '../aftership/aftership.module';
import { ClassificationUtil } from './utils/classification.util';
import { GoogleOauthService } from '../google-oauth/google-oauth.service';
import { AgentsModule } from '../agents/agents.module';
import { OpenAIModule } from '../openai/openai.module';
import { AiAssistantModule } from '../agents/ai-assistant/ai-assistant.module';

@Module({
  imports: [
    InfraModule,
    RepositoriesModule,
    WooCommerceModule,
    AftershipModule,
    AgentsModule,
    OpenAIModule,
    AiAssistantModule,
  ],
  controllers: [EmailPipelineController],
  providers: [EmailPipelineService, EmailActivities, ClassificationUtil, GoogleOauthService],
  exports: [EmailPipelineService],
})
export class EmailPipelineModule {}
