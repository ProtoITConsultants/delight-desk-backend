import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { agentMetrics, emails, escalationLogs } from '../schema';

@Injectable()
export class MetricsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async incrementCounter(metric: string) {
    // Simple counter increment - could use Redis for better performance
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Implementation depends on your counter storage strategy
    // This is a placeholder
  }

  async recordDuration(category: string, duration: number) {
    // Record duration metric
  }

  async recordEscalation(data: any) {
    await this.db.insert(escalationLogs).values(data);
  }

  async getAgentMetrics(agentType: string, timeRange?: any) {
    const query: any = this.db
      .select()
      .from(agentMetrics)
      .where(eq(agentMetrics.agentType, agentType));

    if (timeRange) {
      query.where(
        and(gte(agentMetrics.date, timeRange.start), lte(agentMetrics.date, timeRange.end)),
      );
    }

    const results = await query;

    // Aggregate metrics
    const totalProcessed = results.reduce((sum, r) => sum + r.totalProcessed, 0);
    const successCount = results.reduce((sum, r) => sum + r.successCount, 0);
    const escalationCount = results.reduce((sum, r) => sum + r.escalationCount, 0);
    const approvalCount = results.reduce((sum, r) => sum + r.approvalCount, 0);
    const totalResponseTime = results.reduce((sum, r) => sum + r.totalResponseTime, 0);

    return {
      totalProcessed,
      successRate: totalProcessed > 0 ? (successCount / totalProcessed) * 100 : 0,
      avgResponseTime: totalProcessed > 0 ? totalResponseTime / totalProcessed : 0,
      escalationRate: totalProcessed > 0 ? (escalationCount / totalProcessed) * 100 : 0,
      approvalRate: totalProcessed > 0 ? (approvalCount / totalProcessed) * 100 : 0,
    };
  }

  async getTotalEmailsCount(userId: string) {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(eq(emails.userId, userId));
    return result[0]?.count || 0;
  }

  async getResolvedCount(userId: string) {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(eq(emails.userId, userId), eq(emails.status, 'resolved')));
    return result[0]?.count || 0;
  }

  async getPendingApprovalsCount(userId: string) {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(eq(emails.userId, userId), eq(emails.status, 'pending_approval')));
    return result[0]?.count || 0;
  }

  async getEscalatedCount(userId: string) {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(eq(emails.userId, userId), eq(emails.status, 'escalated')));
    return result[0]?.count || 0;
  }

  async getAvgResponseTime(userId: string) {
    // Calculate average response time from execution summaries
    return 0; // Placeholder
  }

  async getCategoryCounts(userId: string) {
    const results: any = await this.db
      .select({
        category: emails.category,
        count: sql<number>`count(*)`,
      })
      .from(emails)
      .where(eq(emails.userId, userId))
      .groupBy(emails.category);

    return results.reduce(
      (acc, r) => {
        acc[r.category] = r.count;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
