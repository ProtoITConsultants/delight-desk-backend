import { Module } from '@nestjs/common';
import { ActivityLogEventsService } from './activity-log-events.service';

/**
 * Small standalone module that owns the activity log SSE event bus.
 *
 * It's kept separate from `DashboardModule` so `InfraModule` (Temporal
 * activities) and `ApprovalQueueModule` can import just the event bus
 * without pulling in the dashboard controllers/services — which would
 * create a circular dependency. Same pattern as
 * `ApprovalQueueEventsModule`.
 */
@Module({
  providers: [ActivityLogEventsService],
  exports: [ActivityLogEventsService],
})
export class ActivityLogEventsModule {}
