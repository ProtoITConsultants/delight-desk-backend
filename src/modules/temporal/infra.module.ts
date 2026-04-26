import { TemporalModule } from 'nestjs-temporal-core';
import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../../database/database.module';

import { EmailActivities } from './activities/shared/email.activities';
import { EmailProviderAdapter } from './activities/shared/email-provider.adapter';
import { ApprovalQueueActivities } from './activities/shared/approval-queue.activities';
import { EscalationActivities } from './activities/shared/escalation.activities';
import { AiIdentityActivities } from './activities/shared/ai-identity.activities';
import { OrderActivities } from './activities/shared/order.activities';
import { CustomerMessageActivities } from './activities/shared/customer-message.activities';
import { MessageFormattingHelper } from './activities/shared/message-formatting.helper';

import { WismoTrackingActivities } from './activities/agents/wismo/wismo-tracking.activities';
import { OrderCancellationActivities } from './activities/agents/order-cancellation/order-cancellation.activities';
import { AddressChangeActivities } from './activities/agents/address-change/address-change.activities';
import { ProductActivities } from './activities/agents/product/product.activities';
import { PromoCodeActivities } from './activities/agents/promo-code/promo-code.activities';

import { RepositoriesModule } from '../../database/repositories.module';
import { WooCommerceModule } from '../woocommerce/woocommerce.module';
import { AftershipModule } from '../aftership/aftership.module';
import { AgentsModule } from '../agents/agents.module';
import { OpenAIModule } from '../openai/openai.module';
import { SendgridModule } from '../sendgrid/sendgrid.module';
import { AiAssistantModule } from '../ai-assistant/ai-assistant.module';
import { GoogleOauthModule } from '../google-oauth/google-oauth.module';
import { MicrosoftOauthModule } from '../microsoft-oauth/microsoft-oauth.module';
import { ShipBobModule } from '../shipbob/shipbob.module';
import { ShipStationModule } from '../shipstation/shipstation.module';
import { AiTeamCenterModule } from '../ai-team-center/ai-team-center.module';
import { ApprovalQueueEventsModule } from '../approval-queue/approval-queue-events.module';
import { ActivityLogEventsModule } from '../dashboard/activity-log/activity-log-events.module';
import { ClassificationUtil } from './utils/classification.util';
import { InfraService } from './infra.service';
import { sentryActivityInterceptor } from '../../sentry/sentry-activity.interceptor';

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
    AiTeamCenterModule,
    ApprovalQueueEventsModule,
    ActivityLogEventsModule,
    forwardRef(() => AiAssistantModule),
    forwardRef(() => GoogleOauthModule),
    forwardRef(() => MicrosoftOauthModule),
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
              EmailActivities,
              ApprovalQueueActivities,
              EscalationActivities,
              AiIdentityActivities,
              OrderActivities,
              WismoTrackingActivities,
              CustomerMessageActivities,
              OrderCancellationActivities,
              AddressChangeActivities,
              ProductActivities,
              PromoCodeActivities,
            ],
            autoStart: true,
            // Capture activity failures in Sentry. Workflow code cannot call Sentry directly
            // (it must be deterministic), so reporting happens here at the activity boundary.
            workerOptions: {
              interceptors: {
                activity: [sentryActivityInterceptor],
              },
            },
          },
        };
      },
    }),
  ],
  providers: [
    ClassificationUtil,
    MessageFormattingHelper,
    EmailProviderAdapter,
    EmailActivities,
    ApprovalQueueActivities,
    EscalationActivities,
    AiIdentityActivities,
    OrderActivities,
    WismoTrackingActivities,
    CustomerMessageActivities,
    OrderCancellationActivities,
    AddressChangeActivities,
    ProductActivities,
    PromoCodeActivities,
    InfraService,
  ],
  exports: [TemporalModule, HttpModule, DatabaseModule, InfraService],
})
export class InfraModule {}
