import { TemporalModule } from 'nestjs-temporal-core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../../../database/database.module';

// Shared activities
import { EmailActivities } from './activities/shared/email.activities';
import { ApprovalQueueActivities } from './activities/shared/approval-queue.activities';
import { EscalationActivities } from './activities/shared/escalation.activities';
import { AiIdentityActivities } from './activities/shared/ai-identity.activities';

// WISMO-specific activities
import { WismoOrderActivities } from './activities/agents/wismo/wismo-order.activities';
import { WismoTrackingActivities } from './activities/agents/wismo/wismo-tracking.activities';
import { WismoMessageActivities } from './activities/agents/wismo/wismo-messages.activities';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    DatabaseModule,
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
            ],
            autoStart: true,
          },
        };
      },
    }),
  ],
  exports: [TemporalModule, HttpModule, DatabaseModule],
})
export class InfraModule {}
