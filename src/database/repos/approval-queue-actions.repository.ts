import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { approvalQueueActions } from '../schema';

@Injectable()
export class ApprovalQueueActionsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  /**
   * Create a new approval queue action
   */
  async createAction(data: typeof approvalQueueActions.$inferInsert) {
    const [created] = await this.db.insert(approvalQueueActions).values(data).returning();
    return created;
  }

  /**
   * Get action by ID
   */
  async findById(id: string) {
    const [action] = await this.db
      .select()
      .from(approvalQueueActions)
      .where(eq(approvalQueueActions.id, id));

    return action;
  }

  /**
   * Get all actions for a specific approval queue item (workflow)
   */
  async getActionsForWorkflow(approvalQueueId: string) {
    const actions = await this.db
      .select()
      .from(approvalQueueActions)
      .where(eq(approvalQueueActions.approvalQueueId, approvalQueueId))
      .orderBy(approvalQueueActions.actionStep);

    return actions;
  }

  /**
   * Get pending actions for a workflow
   */
  async getPendingActions(approvalQueueId: string) {
    const actions = await this.db
      .select()
      .from(approvalQueueActions)
      .where(
        and(
          eq(approvalQueueActions.approvalQueueId, approvalQueueId),
          eq(approvalQueueActions.actionStatus, 'pending_approval'),
        ),
      )
      .orderBy(approvalQueueActions.actionStep);

    return actions;
  }

  /**
   * Update action status
   */
  async updateActionStatus(
    id: string,
    actionStatus: string,
    additionalData?: Partial<typeof approvalQueueActions.$inferInsert>,
  ) {
    // Ensure date fields are proper Date objects
    const updateData: any = { ...additionalData };
    if (updateData.reviewedAt && !(updateData.reviewedAt instanceof Date)) {
      updateData.reviewedAt = new Date(updateData.reviewedAt);
    }
    if (updateData.executedAt && !(updateData.executedAt instanceof Date)) {
      updateData.executedAt = new Date(updateData.executedAt);
    }

    const [updated] = await this.db
      .update(approvalQueueActions)
      .set({
        actionStatus,
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(approvalQueueActions.id, id))
      .returning();

    return updated;
  }

  /**
   * Update action
   */
  async updateAction(id: string, data: Partial<typeof approvalQueueActions.$inferInsert>) {
    // Ensure date fields are proper Date objects
    const updateData: any = { ...data };
    if (updateData.reviewedAt && !(updateData.reviewedAt instanceof Date)) {
      updateData.reviewedAt = new Date(updateData.reviewedAt);
    }
    if (updateData.executedAt && !(updateData.executedAt instanceof Date)) {
      updateData.executedAt = new Date(updateData.executedAt);
    }

    const [updated] = await this.db
      .update(approvalQueueActions)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(approvalQueueActions.id, id))
      .returning();

    return updated;
  }

  /**
   * Mark action as executed
   */
  async markAsExecuted(id: string, executionResult?: any) {
    // Ensure executedAt from result is a proper Date if provided
    const executedAt = executionResult?.executedAt
      ? executionResult.executedAt instanceof Date
        ? executionResult.executedAt
        : new Date(executionResult.executedAt)
      : new Date();

    const [updated] = await this.db
      .update(approvalQueueActions)
      .set({
        actionStatus: 'executed',
        executedAt,
        executionResult,
        updatedAt: new Date(),
      })
      .where(eq(approvalQueueActions.id, id))
      .returning();

    return updated;
  }

  /**
   * Mark action as escalated
   */
  async markAsEscalated(id: string, escalationId: string, executionError?: any) {
    const [updated] = await this.db
      .update(approvalQueueActions)
      .set({
        actionStatus: 'escalated',
        escalatedDuringExecution: true,
        escalationId,
        executionError,
        updatedAt: new Date(),
      })
      .where(eq(approvalQueueActions.id, id))
      .returning();

    return updated;
  }

  /**
   * Get action statistics for a workflow
   */
  async getActionStats(approvalQueueId: string) {
    const [stats] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'pending_approval')::int`,
        approved: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'approved')::int`,
        executing: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'executing')::int`,
        executed: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'executed')::int`,
        failed: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'failed')::int`,
        escalated: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'escalated')::int`,
        rejected: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'rejected')::int`,
      })
      .from(approvalQueueActions)
      .where(eq(approvalQueueActions.approvalQueueId, approvalQueueId));

    return stats;
  }

  /**
   * Get latest action for a workflow
   */
  async getLatestAction(approvalQueueId: string) {
    const [action] = await this.db
      .select()
      .from(approvalQueueActions)
      .where(eq(approvalQueueActions.approvalQueueId, approvalQueueId))
      .orderBy(desc(approvalQueueActions.actionStep))
      .limit(1);

    return action;
  }

  /**
   * Count actions by status
   */
  async countByStatus(approvalQueueId: string, status: string) {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalQueueActions)
      .where(
        and(
          eq(approvalQueueActions.approvalQueueId, approvalQueueId),
          eq(approvalQueueActions.actionStatus, status),
        ),
      );

    return result.count;
  }

  /**
   * Check if all actions are completed
   */
  async areAllActionsCompleted(approvalQueueId: string): Promise<boolean> {
    const [result] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${approvalQueueActions.actionStatus} = 'executed')::int`,
      })
      .from(approvalQueueActions)
      .where(eq(approvalQueueActions.approvalQueueId, approvalQueueId));

    return result.total > 0 && result.total === result.completed;
  }

  /**
   * Cancel all pending_approval actions for a workflow (bulk update to rejected)
   */
  async cancelPendingActions(approvalQueueId: string) {
    await this.db
      .update(approvalQueueActions)
      .set({ actionStatus: 'rejected', updatedAt: new Date() })
      .where(
        and(
          eq(approvalQueueActions.approvalQueueId, approvalQueueId),
          eq(approvalQueueActions.actionStatus, 'pending_approval'),
        ),
      );
  }

  /**
   * Check if any action is escalated
   */
  async hasEscalatedAction(approvalQueueId: string): Promise<boolean> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalQueueActions)
      .where(
        and(
          eq(approvalQueueActions.approvalQueueId, approvalQueueId),
          eq(approvalQueueActions.actionStatus, 'escalated'),
        ),
      );

    return result.count > 0;
  }
}
