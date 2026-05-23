import { IsEnum, IsOptional } from 'class-validator';

export enum DashboardAnalyticsRange {
  TODAY = 'today',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_365_DAYS = 'last_365_days',
}

export class GetDashboardAnalyticsDto {
  @IsOptional()
  @IsEnum(DashboardAnalyticsRange)
  range?: DashboardAnalyticsRange = DashboardAnalyticsRange.TODAY;
}

export class DashboardAnalyticsResponseDto {
  range!: DashboardAnalyticsRange;

  from!: string;

  to!: string;

  aiAgentActionsCompleted!: number;

  aiAssistantTicketsResolved!: number;

  totalEmailsReceived!: number;

  timeSavedMinutes!: number;

  averageActionsPerResolvedTicket!: number;
}

export class NavBadgeCountsResponseDto {
  /** Approval queue items with at least one action in `pending_approval`. */
  approvalQueuePendingApproval!: number;

  /** AI Assistant escalation tickets with status `pending`. */
  aiAssistantPending!: number;
}
