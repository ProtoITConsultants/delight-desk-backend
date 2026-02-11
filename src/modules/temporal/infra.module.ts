import { TemporalModule } from 'nestjs-temporal-core';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../../database/database.module';

// Shared activities
import { EmailActivities } from './activities/shared/email.activities';
import { ApprovalQueueActivities } from './activities/shared/approval-queue.activities';
import { EscalationActivities } from './activities/shared/escalation.activities';
import { AiIdentityActivities } from './activities/shared/ai-identity.activities';

// WISMO-specific activities
import { WismoOrderActivities } from './activities/agents/wismo/wismo-order.activities';
import { WismoTrackingActivities } from './activities/agents/wismo/wismo-tracking.activities';
import { WismoMessageActivities } from './activities/agents/wismo/wismo-messages.activities';

// Order Cancellation-specific activities
import { OrderCancellationWooCommerceActivities } from './activities/agents/order-cancellation/order-cancellation-woocommerce.activities';
// import { OrderCancellationValidationActivities } from './activities/agents/order-cancellation/order-cancellation-validation.activities';
import { OrderCancellationShipBobActivities } from './activities/agents/order-cancellation/order-cancellation-shipbob.activities';
import { OrderCancellationShipStationActivities } from './activities/agents/order-cancellation/order-cancellation-shipstation.activities';

import { RepositoriesModule } from '../../database/repositories.module';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { AftershipModule } from '../aftership/aftership.module';
import { AgentsModule } from '../agents/agents.module';
import { OpenAIModule } from '../openai/openai.module';
import { SendgridModule } from '../sendgrid/sendgrid.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { GoogleOauthModule } from '../google-oauth/google-oauth.module';
import { ShipBobModule } from '../shipbob/shipbob.module';
import { ShipStationModule } from '../shipstation/shipstation.module';
import { ClassificationUtil } from './utils/classification.util';
import { MessageFormattingHelper } from './activities/shared/message-formatting.helper';
import { InfraService } from './infra.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    DatabaseModule,
    RepositoriesModule,
    WooCommerceModule,
    AftershipModule,
    AgentsModule,
    OpenAIModule,
    SendgridModule,
    ShipBobModule,
    ShipStationModule,
    forwardRef(() => AiAssistantModule),
    forwardRef(() => GoogleOauthModule),
    TemporalModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const namespace = config.get('TEMPORAL_NAMESPACE');
        const apiKey = config.get('TEMPORAL_API_KEY');
        const endpoint = config.get('TEMPORAL_ENDPOINT');
        const taskQueue = config.get('TEMPORAL_TASK_QUEUE');

        if (!namespace || !apiKey || !endpoint || !taskQueue) {
          throw new Error('Temporal env variables are not defined');
        }

        return {
          connection: {
            address: endpoint,
            tls: true,
            apiKey,
            namespace,
          },
          taskQueue: taskQueue,
          worker: {
            workflowsPath: require.resolve('./workflows/email.workflow'),
            activityClasses: [
              // Shared activities
              EmailActivities,
              ApprovalQueueActivities,
              EscalationActivities,
              AiIdentityActivities,
              // WISMO-specific activities
              WismoOrderActivities,
              WismoTrackingActivities,
              WismoMessageActivities,
              // Order Cancellation-specific activities
              OrderCancellationWooCommerceActivities,
              // OrderCancellationValidationActivities,
              OrderCancellationShipBobActivities,
              OrderCancellationShipStationActivities,
            ],
            autoStart: true,
          },
        };
      },
    }),
  ],
  providers: [
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
    // Order Cancellation-specific activities
    OrderCancellationWooCommerceActivities,
    // OrderCancellationValidationActivities,
    OrderCancellationShipBobActivities,
    OrderCancellationShipStationActivities,
    InfraService,
  ],
  exports: [TemporalModule, HttpModule, DatabaseModule, InfraService],
})
export class InfraModule {}
