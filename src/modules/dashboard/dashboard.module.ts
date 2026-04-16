import { Module } from '@nestjs/common';
import { RepositoriesModule } from '../../database/repositories.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ActivityLogController } from './activity-log/activity-log.controller';
import { ActivityLogService } from './activity-log/activity-log.service';
import { ActivityLogEventsModule } from './activity-log/activity-log-events.module';

/**
 * Umbrella module for everything the dashboard UI needs.
 *
 * - Analytics (Mission Control metrics)     -> DashboardController / DashboardService
 * - Activity Log (real-time action feed)    -> ActivityLogController / ActivityLogService
 *
 * The activity log's SSE event bus lives in its own tiny module
 * (`ActivityLogEventsModule`) so other modules (Temporal `InfraModule`
 * and `ApprovalQueueModule`) can import just the bus without creating a
 * circular dependency on the full dashboard.
 */
@Module({
  imports: [RepositoriesModule, ActivityLogEventsModule],
  controllers: [DashboardController, ActivityLogController],
  providers: [DashboardService, ActivityLogService],
  exports: [DashboardService, ActivityLogService],
})
export class DashboardModule {}
