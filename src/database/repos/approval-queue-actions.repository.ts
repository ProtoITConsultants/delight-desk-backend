import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
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
   * Get all actions for multiple approval queue IDs in one query (for list enrichment).
   * Returns actions ordered by approvalQueueId and actionStep.
   */
  async getActionsForApprovalQueueIds(approvalQueueIds: string[]) {
    if (approvalQueueIds.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(approvalQueueActions)
      .where(inArray(approvalQueueActions.approvalQueueId, approvalQueueIds))
      .orderBy(
        asc(approvalQueueActions.approvalQueueId),
        asc(approvalQueueActions.actionStep),
      );
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
    const [updated] = await this.db
      .update(approvalQueueActions)
      .set({
        actionStatus,
        ...(additionalData || {}),
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
    const [updated] = await this.db
      .update(approvalQueueActions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(approvalQueueActions.id, id))
      .returning();

    return updated;
  }

  /**
   * Mark action as executed
   */
  async markAsExecuted(id: string) {
    const [updated] = await this.db
      .update(approvalQueueActions)
      .set({
        actionStatus: 'executed',
        updatedAt: new Date(),
      })
      .where(eq(approvalQueueActions.id, id))
      .returning();

    return updated;
  }

  /**
   * Mark action as escalated
   */
  async markAsEscalated(id: string, escalationId: string, escalationReason?: string) {
    const [updated] = await this.db
      .update(approvalQueueActions)
      .set({
        actionStatus: 'escalated',
        escalationId,
        escalationReason: escalationReason || null,
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
