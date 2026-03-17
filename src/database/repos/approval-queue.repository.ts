import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { approvalQueue, approvalQueueActions } from '../schema';

@Injectable()
export class ApprovalQueueRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async createApprovalQueueItem(data: typeof approvalQueue.$inferInsert) {
    const [created] = await this.db.insert(approvalQueue).values(data).returning();
    return created;
  }

  async findById(id: string, userId: string) {
    const [item] = await this.db
      .select()
      .from(approvalQueue)
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)));

    return item;
  }

  async findByWorkflowId(workflowId: string, userId: string) {
    const [item] = await this.db
      .select()
      .from(approvalQueue)
      .where(and(eq(approvalQueue.workflowId, workflowId), eq(approvalQueue.userId, userId)));

    return item;
  }

  async findByIdWithDetails(id: string, userId: string) {
    const [item] = await this.db
      .select({ approval: approvalQueue })
      .from(approvalQueue)
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)));

    return item;
  }

  async findByIdWithActions(id: string, userId: string) {
    const [item, actions] = await Promise.all([
      this.findByIdWithDetails(id, userId),
      this.db
        .select()
        .from(approvalQueueActions)
        .where(eq(approvalQueueActions.approvalQueueId, id))
        .orderBy(approvalQueueActions.actionStep),
    ]);

    if (!item) return null;

    return { ...item, actions };
  }

  async getApprovalQueueWithFilters(filters: {
    userId: string;
    status: string | undefined;
    category: string | undefined;
    limit: number;
    offset: number;
  }) {
    const conditions = [eq(approvalQueue.userId, filters.userId)];

    if (filters.status && filters.status.length > 0) {
      conditions.push(eq(approvalQueue.status, filters.status));
    }

    if (filters.category) {
      conditions.push(eq(approvalQueue.category, filters.category));
    }

    const items = await this.db
      .select({
        approval: approvalQueue,
        totalItems: sql<number>`count(*) over()::int`,
      })
      .from(approvalQueue)
      .where(and(...conditions))
      .orderBy(desc(approvalQueue.createdAt))
      .limit(filters.limit || 20)
      .offset(filters.offset || 0);

    return items;
  }

  async countApprovalQueueWithFilters(filters: {
    userId: string;
    status: string | undefined;
    category: string | undefined;
    limit: number;
    offset: number;
  }): Promise<number> {
    const conditions = [eq(approvalQueue.userId, filters.userId)];

    if (filters.status && filters.status.length > 0) {
      conditions.push(eq(approvalQueue.status, filters.status));
    }

    if (filters.category) {
      conditions.push(eq(approvalQueue.category, filters.category));
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

  async updateStatus(
    id: string,
    userId: string,
    status: string,
    additionalData?: Partial<typeof approvalQueue.$inferInsert>,
  ) {
    const [updated] = await this.db
      .update(approvalQueue)
      .set({
        status,
        ...additionalData,
        updatedAt: new Date(),
      })
      .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)))
      .returning();

    return updated;
  }

  async markAsInProgress(id: string, userId: string) {
    return this.updateStatus(id, userId, 'in_progress');
  }

  async markAsCompleted(id: string, userId: string) {
    return this.updateStatus(id, userId, 'completed', {
      completedAt: new Date(),
    });
  }

  async markAsEscalated(id: string, userId: string, escalationId: string) {
    return this.updateStatus(id, userId, 'escalated', {
      escalationId,
      escalatedAt: new Date(),
    });
  }

  async markAsCancelled(id: string, userId: string) {
    return this.updateStatus(id, userId, 'cancelled');
  }

  async cancelWorkflowTransactionally(id: string, userId: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .update(approvalQueueActions)
        .set({ actionStatus: 'rejected', updatedAt: new Date() })
        .where(
          and(
            eq(approvalQueueActions.approvalQueueId, id),
            eq(approvalQueueActions.actionStatus, 'pending_approval'),
          ),
        );

      await tx
        .update(approvalQueue)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(approvalQueue.id, id), eq(approvalQueue.userId, userId)));
    });
  }

  async getStats(userId: string) {
    const [stats] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${approvalQueue.status} = 'pending')::int`,
        inProgress: sql<number>`count(*) filter (where ${approvalQueue.status} = 'in_progress')::int`,
        cancelled: sql<number>`count(*) filter (where ${approvalQueue.status} = 'cancelled')::int`,
        escalated: sql<number>`count(*) filter (where ${approvalQueue.status} = 'escalated')::int`,
        completed: sql<number>`count(*) filter (where ${approvalQueue.status} = 'completed')::int`,
      })
      .from(approvalQueue)
      .where(eq(approvalQueue.userId, userId));

    return stats;
  }
}
