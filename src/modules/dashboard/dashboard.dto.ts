import { IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum DashboardAnalyticsRange {
  TODAY = 'today',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_365_DAYS = 'last_365_days',
}

export class GetDashboardAnalyticsDto {
  @ApiPropertyOptional({
    description:
      'Time window to aggregate analytics over. Defaults to "today" (from start of today to now).',
    enum: DashboardAnalyticsRange,
    example: DashboardAnalyticsRange.TODAY,
    default: DashboardAnalyticsRange.TODAY,
  })
  @IsOptional()
  @IsEnum(DashboardAnalyticsRange)
  range?: DashboardAnalyticsRange = DashboardAnalyticsRange.TODAY;
}

export class DashboardAnalyticsResponseDto {
  @ApiProperty({
    description: 'The range used to compute these metrics.',
    enum: DashboardAnalyticsRange,
    example: DashboardAnalyticsRange.TODAY,
  })
  range!: DashboardAnalyticsRange;

  @ApiProperty({
    description: 'Start of the aggregation window (ISO timestamp, inclusive).',
    example: '2026-04-16T00:00:00.000Z',
  })
  from!: string;

  @ApiProperty({
    description: 'End of the aggregation window (ISO timestamp, inclusive).',
    example: '2026-04-16T23:59:59.999Z',
  })
  to!: string;

  @ApiProperty({
    description: 'Number of AI agent actions completed (executed) in the window.',
    example: 0,
  })
  aiAgentActionsCompleted!: number;

  @ApiProperty({
    description: 'Number of AI Assistant tickets (escalations) resolved in the window.',
    example: 12,
  })
  aiAssistantTicketsResolved!: number;

  @ApiProperty({
    description: 'Number of incoming emails received by the system in the window.',
    example: 1234,
  })
  totalEmailsReceived!: number;

  @ApiProperty({
    description:
      'Estimated total time saved by the system in the window, expressed in minutes. Derived from completed AI agent actions and resolved AI Assistant tickets.',
    example: 1234,
  })
  timeSavedMinutes!: number;

  @ApiProperty({
    description:
      'Average number of AI agent actions executed per resolved ticket in the window. A "resolved ticket" is an approval queue workflow that reached the completed status (i.e., the AI fully handled the customer inquiry end-to-end). Rounded to 2 decimal places. Returns 0 when there were no resolved tickets in the window.',
    example: 3.25,
  })
  averageActionsPerResolvedTicket!: number;
}
