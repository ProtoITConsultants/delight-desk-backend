import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { approvalQueue, approvalQueueActivityLog, emails, emailThreads } from '../schema';

export interface GetApprovalQueueFilters {
  userId: string;
  status?: string[];
  agentType?: string;
  priority?: string[];
  limit?: number;
  offset?: number;
}

@Injectable()
export class ApprovalQueueRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async createApprovalQueueItem(data: typeof approvalQueue.$inferInsert) {
    const [created] = await this.db.insert(approvalQueue).values(data).returning();

    // Log the creation
    await this.logActivity({
      approvalQueueId: created.id,
      userId: data.userId,
      action: 'created',
      description: 'Approval queue item created',
      metadata: {
        agentType: data.agentType,
        category: data.category,
        priority: data.priority,
      },
    });

    return created;
  }

  async findById(id: string, userId: string) {
    const [item] = await this.db
      .select()
      .from(approvalQueue)
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)));

    return item;
  }

  async findByIdWithDetails(id: string, userId: string) {
    const [item] = await this.db
      .select({
        approval: approvalQueue,
        email: emails,
        thread: emailThreads,
      })
      .from(approvalQueue)
      .leftJoin(emails, eq(approvalQueue.emailId, emails.id))
      .leftJoin(emailThreads, eq(approvalQueue.threadId, emailThreads.id))
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)));

    return item;
  }

  async getApprovalQueueWithFilters(filters: {
    userId: string;
    status: string | undefined;
    agentType: string | undefined;
    priority: string[] | undefined;
    limit: number;
    offset: number;
  }) {
    const conditions = [eq(approvalQueue.userId, filters.userId)];

    if (filters.status && filters.status.length > 0) {
      conditions.push(eq(approvalQueue.status, filters.status));
    }

    if (filters.agentType) {
      conditions.push(eq(approvalQueue.agentType, filters.agentType));
    }

    if (filters.priority && filters.priority.length > 0) {
      conditions.push(inArray(approvalQueue.priority, filters.priority));
    }

    const items = await this.db
      .select({
        approval: approvalQueue,
        email: {
          id: emails.id,
          subject: emails.subject,
          fromEmail: emails.fromEmail,
          snippet: emails.snippet,
        },
      })
      .from(approvalQueue)
      .leftJoin(emails, eq(approvalQueue.emailId, emails.id))
      .where(and(...conditions))
      .orderBy(desc(approvalQueue.createdAt))
      .limit(filters.limit || 20)
      .offset(filters.offset || 0);

    return items;
  }

  async countApprovalQueueWithFilters(filters: {
    userId: string;
    status: string | undefined;
    agentType: string | undefined;
    priority: string[] | undefined;
    limit: number;
    offset: number;
  }): Promise<number> {
    const conditions = [eq(approvalQueue.userId, filters.userId)];

    if (filters.status && filters.status.length > 0) {
      conditions.push(eq(approvalQueue.status, filters.status));
    }

    if (filters.agentType) {
      conditions.push(eq(approvalQueue.agentType, filters.agentType));
    }

    if (filters.priority && filters.priority.length > 0) {
      conditions.push(inArray(approvalQueue.priority, filters.priority));
    }

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalQueue)
      .where(and(...conditions));

    return result.count;
  }

  async updateApprovalQueueItem(
    id: string,
    userId: string,
    data: Partial<typeof approvalQueue.$inferInsert>,
  ) {
    const [updated] = await this.db
      .update(approvalQueue)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)))
      .returning();

    return updated;
  }

  async approveItem(id: string, userId: string, reviewedBy: string, notes?: string) {
    const [updated] = await this.db
      .update(approvalQueue)
      .set({
        status: 'approved',
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: notes,
        updatedAt: new Date(),
      })
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)))
      .returning();

    await this.logActivity({
      approvalQueueId: id,
      userId: reviewedBy,
      action: 'approved',
      description: 'Item approved for execution',
      metadata: { notes },
    });

    return updated;
  }

  async rejectItem(id: string, userId: string, reviewedBy: string, reason: string, notes?: string) {
    const [updated] = await this.db
      .update(approvalQueue)
      .set({
        status: 'rejected',
        reviewedBy,
        reviewedAt: new Date(),
        rejectionReason: reason,
        reviewNotes: notes,
        updatedAt: new Date(),
      })
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)))
      .returning();

    await this.logActivity({
      approvalQueueId: id,
      userId: reviewedBy,
      action: 'rejected',
      description: 'Item rejected',
      metadata: { reason, notes },
    });

    return updated;
  }

  async editAndApprove(
    id: string,
    userId: string,
    reviewedBy: string,
    editedResponse: string,
    notes?: string,
  ) {
    const [updated] = await this.db
      .update(approvalQueue)
      .set({
        status: 'edited',
        editedResponse,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNotes: notes,
        updatedAt: new Date(),
      })
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)))
      .returning();

    await this.logActivity({
      approvalQueueId: id,
      userId: reviewedBy,
      action: 'edited',
      description: 'Response edited and approved',
      metadata: { hasEdits: true, notes },
    });

    return updated;
  }

  async markAsExecuted(id: string, userId: string, executionResult?: any) {
    const [updated] = await this.db
      .update(approvalQueue)
      .set({
        status: 'executed',
        executedAt: new Date(),
        executionResult,
        updatedAt: new Date(),
      })
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)))
      .returning();

    await this.logActivity({
      approvalQueueId: id,
      userId,
      action: 'executed',
      description: 'Workflow executed successfully',
      metadata: executionResult,
    });

    return updated;
  }

  async logActivity(data: typeof approvalQueueActivityLog.$inferInsert) {
    const [log] = await this.db.insert(approvalQueueActivityLog).values(data).returning();
    return log;
  }

  async getActivityLog(approvalQueueId: string) {
    return await this.db
      .select()
      .from(approvalQueueActivityLog)
      .where(eq(approvalQueueActivityLog.approvalQueueId, approvalQueueId))
      .orderBy(desc(approvalQueueActivityLog.createdAt));
  }

  async getStats(userId: string) {
    const [stats] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${approvalQueue.status} = 'pending')::int`,
        approved: sql<number>`count(*) filter (where ${approvalQueue.status} = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where ${approvalQueue.status} = 'rejected')::int`,
        executed: sql<number>`count(*) filter (where ${approvalQueue.status} = 'executed')::int`,
      })
      .from(approvalQueue)
      .where(eq(approvalQueue.userId, userId));

    return stats;
  }
}
