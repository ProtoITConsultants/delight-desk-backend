import { Injectable } from '@nestjs/common';
import {
  DashboardAnalyticsRepository,
  DashboardDateRange,
} from '../../database/repos/dashboard-analytics.repository';
import { ApprovalQueueRepository } from '../../database/repos/approval-queue.repository';
import { EscalationsRepository } from '../../database/repos/escalations.repository';
import {
  DashboardAnalyticsRange,
  DashboardAnalyticsResponseDto,
  NavBadgeCountsResponseDto,
} from './dashboard.dto';

// Estimated minutes saved per automated AI agent action that the system
// executed on the user's behalf (e.g., replying to a WISMO email, issuing
// a refund). Tuned conservatively - a human would typically spend around
// this long triaging + acting on a single request.
const MINUTES_SAVED_PER_AI_AGENT_ACTION = 3;

// Estimated minutes saved each time the AI Assistant drafts + resolves
// a ticket that otherwise would have required a human support rep to
// read, research, and reply from scratch.
const MINUTES_SAVED_PER_ASSISTANT_TICKET_RESOLVED = 10;

@Injectable()
export class DashboardService {
  constructor(
    private readonly analyticsRepository: DashboardAnalyticsRepository,
    private readonly approvalQueueRepository: ApprovalQueueRepository,
    private readonly escalationsRepository: EscalationsRepository,
  ) {}

  async getNavBadgeCounts(userId: string): Promise<NavBadgeCountsResponseDto> {
    const [approvalQueuePendingApproval, aiAssistantPending] = await Promise.all([
      this.approvalQueueRepository.countPendingApprovalItems(userId),
      this.escalationsRepository.countByStatus(userId, 'pending'),
    ]);

    return {
      approvalQueuePendingApproval,
      aiAssistantPending,
    };
  }

  async getAnalytics(
    userId: string,
    range: DashboardAnalyticsRange,
  ): Promise<DashboardAnalyticsResponseDto> {
    const window = this.resolveRange(range);

    const [
      aiAgentActionsCompleted,
      aiAssistantTicketsResolved,
      totalEmailsReceived,
      resolvedTicketActionStats,
    ] = await Promise.all([
      this.analyticsRepository.countAiAgentActionsCompleted(userId, window),
      this.analyticsRepository.countAiAssistantTicketsResolved(userId, window),
      this.analyticsRepository.countEmailsReceived(userId, window),
      this.analyticsRepository.getResolvedTicketActionStats(userId, window),
    ]);

    const timeSavedMinutes =
      aiAgentActionsCompleted * MINUTES_SAVED_PER_AI_AGENT_ACTION +
      aiAssistantTicketsResolved * MINUTES_SAVED_PER_ASSISTANT_TICKET_RESOLVED;

    const averageActionsPerResolvedTicket =
      this.computeAverageActionsPerResolvedTicket(resolvedTicketActionStats);

    return {
      range,
      from: window.from.toISOString(),
      to: window.to.toISOString(),
      aiAgentActionsCompleted,
      aiAssistantTicketsResolved,
      totalEmailsReceived,
      timeSavedMinutes,
      averageActionsPerResolvedTicket,
    };
  }

  /**
   * Safe average that guards against divide-by-zero when there are no
   * resolved tickets in the window. Rounded to 2 decimal places so the
   * UI can render a compact number.
   */
  private computeAverageActionsPerResolvedTicket(stats: {
    resolvedTickets: number;
    executedActions: number;
  }): number {
    if (stats.resolvedTickets === 0) {
      return 0;
    }
    const avg = stats.executedActions / stats.resolvedTickets;
    return Math.round(avg * 100) / 100;
  }

  /**
   * Resolve a DashboardAnalyticsRange into a concrete [from, to] window.
   *
   * - today          -> start of today (local server time, midnight UTC) -> now
   * - last_7_days    -> now - 7 days  -> now
   * - last_30_days   -> now - 30 days -> now
   * - last_365_days  -> now - 365 days -> now
   */
  private resolveRange(range: DashboardAnalyticsRange): DashboardDateRange {
    const now = new Date();

    if (range === DashboardAnalyticsRange.TODAY) {
      const from = new Date(now);
      from.setUTCHours(0, 0, 0, 0);
      return { from, to: now };
    }

    const daysBack: Record<
      Exclude<DashboardAnalyticsRange, DashboardAnalyticsRange.TODAY>,
      number
    > = {
      [DashboardAnalyticsRange.LAST_7_DAYS]: 7,
      [DashboardAnalyticsRange.LAST_30_DAYS]: 30,
      [DashboardAnalyticsRange.LAST_365_DAYS]: 365,
    };

    const from = new Date(now.getTime() - daysBack[range] * 24 * 60 * 60 * 1000);
    return { from, to: now };
  }
}
