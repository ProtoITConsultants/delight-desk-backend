import { TemporalModule } from 'nestjs-temporal-core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../../../database/database.module';
import { EmailActivities } from './activities/email.activities';

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
            activityClasses: [EmailActivities],
            autoStart: true,
          },
        };
      },
    }),
  ],
  exports: [TemporalModule, HttpModule, DatabaseModule],
})
export class InfraModule {}
