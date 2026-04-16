import { Module } from '@nestjs/common';
import { ApprovalQueueEventsService } from './approval-queue-events.service';

@Module({
  providers: [ApprovalQueueEventsService],
  exports: [ApprovalQueueEventsService],
})
export class ApprovalQueueEventsModule {}
