import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, exists, sql, type SQL } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { approvalQueue, approvalQueueActions } from '../schema';
import {
  PENDING_APPROVAL_ACTION_STATUS,
} from '../../modules/approval-queue/approval-queue-filter.constants';

const CANCELLABLE_ACTION_STATUSES = new Set([
  'pending_approval',
  'executing',
  'approved',
  'awaiting_customer_reply',
]);

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

  async findUserIdByApprovalQueueId(approvalQueueId: string): Promise<string | null> {
    const [item] = await this.db
      .select({ userId: approvalQueue.userId })
      .from(approvalQueue)
      .where(eq(approvalQueue.id, approvalQueueId));

    return item?.userId ?? null;
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
    const conditions = this.buildApprovalQueueFilterConditions(filters);

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
    const conditions = this.buildApprovalQueueFilterConditions(filters);

    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalQueue)
      .where(and(...conditions));

    return result.count;
  }

  private buildApprovalQueueFilterConditions(filters: {
    userId: string;
    status: string | undefined;
    category: string | undefined;
  }): SQL[] {
    const conditions: SQL[] = [eq(approvalQueue.userId, filters.userId)];

    if (filters.status && filters.status.length > 0) {
      if (filters.status === PENDING_APPROVAL_ACTION_STATUS) {
        conditions.push(this.buildPendingApprovalFilterCondition());
      } else {
        conditions.push(eq(approvalQueue.status, filters.status));
      }
    }

    if (filters.category) {
      conditions.push(eq(approvalQueue.category, filters.category));
    }

    return conditions;
  }

  private buildPendingApprovalFilterCondition() {
    return exists(
      this.db
        .select({ id: approvalQueueActions.id })
        .from(approvalQueueActions)
        .where(
          and(
            eq(approvalQueueActions.approvalQueueId, approvalQueue.id),
            eq(approvalQueueActions.actionStatus, PENDING_APPROVAL_ACTION_STATUS),
          ),
        ),
    );
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
      const actions = await tx
        .select()
        .from(approvalQueueActions)
        .where(eq(approvalQueueActions.approvalQueueId, id))
        .orderBy(desc(approvalQueueActions.actionStep));

      const actionToCancel =
        actions.find((action) => CANCELLABLE_ACTION_STATUSES.has(action.actionStatus)) ??
        actions.find((action) => action.actionStatus !== 'executed');

      if (actionToCancel) {
        await tx
          .update(approvalQueueActions)
          .set({ actionStatus: 'cancelled', updatedAt: new Date() })
          .where(eq(approvalQueueActions.id, actionToCancel.id));
      }

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
        pendingApproval: sql<number>`count(*) filter (where exists (
          select 1 from approval_queue_actions a
          where a.approval_queue_id = ${approvalQueue.id}
          and a.action_status = 'pending_approval'
        ))::int`,
        cancelled: sql<number>`count(*) filter (where ${approvalQueue.status} = 'cancelled')::int`,
        escalated: sql<number>`count(*) filter (where ${approvalQueue.status} = 'escalated')::int`,
        completed: sql<number>`count(*) filter (where ${approvalQueue.status} = 'completed')::int`,
      })
      .from(approvalQueue)
      .where(eq(approvalQueue.userId, userId));

    return stats;
  }
}
