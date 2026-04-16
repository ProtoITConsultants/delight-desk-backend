import { Module } from '@nestjs/common';
import { ApprovalQueueController } from './approval-queue.controller';
import { ApprovalQueueService } from './approval-queue.service';
import { RepositoriesModule } from '../../database/repositories.module';
import { InfraModule } from '../temporal/infra.module';
import { ApprovalQueueEventsModule } from './approval-queue-events.module';
import { ActivityLogEventsModule } from '../dashboard/activity-log/activity-log-events.module';

@Module({
  imports: [RepositoriesModule, InfraModule, ApprovalQueueEventsModule, ActivityLogEventsModule],
  controllers: [ApprovalQueueController],
  providers: [ApprovalQueueService],
  exports: [ApprovalQueueService],
})
export class ApprovalQueueModule {}
