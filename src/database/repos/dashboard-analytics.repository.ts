import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { approvalQueue, approvalQueueActions, emails, escalations } from '../schema';

export interface DashboardDateRange {
  from: Date;
  to: Date;
}

@Injectable()
export class DashboardAnalyticsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  /**
   * Count approval queue actions that completed (executed) for a user
   * within the given date range. An action is considered "completed" when
   * its actionStatus transitions to 'executed', so we filter on updatedAt.
   */
  async countAiAgentActionsCompleted(userId: string, range: DashboardDateRange): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalQueueActions)
      .innerJoin(approvalQueue, eq(approvalQueueActions.approvalQueueId, approvalQueue.id))
      .where(
        and(
          eq(approvalQueue.userId, userId),
          eq(approvalQueueActions.actionStatus, 'executed'),
          gte(approvalQueueActions.updatedAt, range.from),
          lte(approvalQueueActions.updatedAt, range.to),
        ),
      );

    return result?.count ?? 0;
  }

  /**
   * Count AI Assistant escalations that were resolved within the given
   * range. Uses resolvedAt as the completion timestamp.
   */
  async countAiAssistantTicketsResolved(
    userId: string,
    range: DashboardDateRange,
  ): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(escalations)
      .where(
        and(
          eq(escalations.userId, userId),
          eq(escalations.status, 'resolved'),
          gte(escalations.resolvedAt, range.from),
          lte(escalations.resolvedAt, range.to),
        ),
      );

    return result?.count ?? 0;
  }

  /**
   * Count incoming emails received by the system for a user within the
   * given range.
   */
  async countEmailsReceived(userId: string, range: DashboardDateRange): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(emails)
      .where(
        and(
          eq(emails.userId, userId),
          eq(emails.direction, 'incoming'),
          gte(emails.createdAt, range.from),
          lte(emails.createdAt, range.to),
        ),
      );

    return result?.count ?? 0;
  }

  /**
   * Aggregate how many executed actions happened per "resolved ticket" in
   * the given range. In this system a "resolved ticket" is an approval
   * queue workflow that reached the `completed` status (i.e., the AI
   * finished all its planned actions end-to-end).
   *
   * Returns both the raw numerator/denominator and the computed average so
   * the value stays auditable.
   */
  async getResolvedTicketActionStats(
    userId: string,
    range: DashboardDateRange,
  ): Promise<{ resolvedTickets: number; executedActions: number }> {
    const [result] = await this.db
      .select({
        resolvedTickets: sql<number>`count(distinct ${approvalQueue.id})::int`,
        executedActions: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'executed')::int`,
      })
      .from(approvalQueue)
      .leftJoin(
        approvalQueueActions,
        eq(approvalQueueActions.approvalQueueId, approvalQueue.id),
      )
      .where(
        and(
          eq(approvalQueue.userId, userId),
          eq(approvalQueue.status, 'completed'),
          gte(approvalQueue.completedAt, range.from),
          lte(approvalQueue.completedAt, range.to),
        ),
      );

    return {
      resolvedTickets: result?.resolvedTickets ?? 0,
      executedActions: result?.executedActions ?? 0,
    };
  }
}
