import { Inject, Injectable } from '@nestjs/common';
import { SQL, and, desc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { approvalQueue, approvalQueueActions } from '../schema';

export interface ActivityLogQueryFilters {
  userId: string;
  /**
   * Raw `approval_queue_actions.actionStatus` values to include. Callers
   * are expected to translate high-level UI status buckets (completed /
   * failed / pending) into this list.
   */
  rawStatuses?: string[];
  limit: number;
  offset: number;
}

export interface ActivityLogRow {
  actionId: string;
  actionStatus: string;
  actionName: string | null;
  actionType: string;
  description: string;
  actionDetails: string | null;
  updatedAt: Date;
  createdAt: Date;
  customerEmail: string | null;
  agentName: string | null;
  totalItems: number;
}

@Injectable()
export class ActivityLogRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  /**
   * Read-model for the dashboard Activity Log card.
   *
   * Each row returned is a single approval queue action, scoped to the
   * authenticated user by joining against `approval_queue.userId`. Rows
   * are ordered by the action's most recent state change (`updatedAt`)
   * so the freshest activity appears at the top.
   *
   * The result piggy-backs `totalItems` on every row (standard pattern
   * used elsewhere in this codebase) so we avoid a second count query.
   */
  async getActivityLog(filters: ActivityLogQueryFilters): Promise<ActivityLogRow[]> {
    const conditions: SQL[] = [eq(approvalQueue.userId, filters.userId)];

    if (filters.rawStatuses && filters.rawStatuses.length > 0) {
      conditions.push(inArray(approvalQueueActions.actionStatus, filters.rawStatuses));
    }

    const whereClause = and(...conditions);

    const rows = await this.db
      .select({
        actionId: approvalQueueActions.id,
        actionStatus: approvalQueueActions.actionStatus,
        actionName: approvalQueueActions.name,
        actionType: approvalQueueActions.actionType,
        description: approvalQueueActions.description,
        actionDetails: approvalQueueActions.actionDetails,
        updatedAt: approvalQueueActions.updatedAt,
        createdAt: approvalQueueActions.createdAt,
        customerEmail: approvalQueue.customerEmail,
        agentName: approvalQueue.agentName,
        totalItems: sql<number>`count(*) over()::int`,
      })
      .from(approvalQueueActions)
      .innerJoin(approvalQueue, eq(approvalQueueActions.approvalQueueId, approvalQueue.id))
      .where(whereClause)
      .orderBy(desc(approvalQueueActions.updatedAt))
      .limit(filters.limit)
      .offset(filters.offset);

    return rows as ActivityLogRow[];
  }
}
