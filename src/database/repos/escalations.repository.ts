import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, like, lte, SQL, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { emails, emailThreads, escalations } from '../schema';

export interface GetEscalationsFilters {
  userId: string;
  status?: string[];
  priority?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: 'createdAt' | 'resolvedAt' | 'priority';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

@Injectable()
export class EscalationsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  private addDateRangeConditions(
    conditions: SQL<unknown>[],
    dateFrom?: string,
    dateTo?: string,
  ): void {
    if (dateFrom) {
      conditions.push(gte(escalations.createdAt, new Date(dateFrom)));
    }
    if (dateTo) {
      conditions.push(lte(escalations.createdAt, new Date(dateTo)));
    }
  }

  async createEscalation(data: any) {
    const [created] = await this.db.insert(escalations).values(data).returning();
    return created;
  }

  async getEscalationsWithFilters(filters: GetEscalationsFilters) {
    const conditions = [eq(escalations.userId, filters.userId)];

    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(escalations.status, filters.status));
    }

    if (filters.search) {
      conditions.push(like(escalations.reason, `%${filters.search}%`));
    }

    this.addDateRangeConditions(conditions, filters.dateFrom, filters.dateTo);

    const sortColumn = filters.sortBy || 'createdAt';
    const sortDirection = filters.sortOrder === 'asc' ? asc : desc;
    let orderByClause;

    if (sortColumn === 'createdAt') {
      orderByClause = sortDirection(escalations.createdAt);
    } else if (sortColumn === 'resolvedAt') {
      orderByClause = sortDirection(escalations.resolvedAt);
    } else if (sortColumn === 'priority') {
      orderByClause = sortDirection(escalations.priority);
    } else {
      orderByClause = desc(escalations.createdAt);
    }

    // Query with pagination
    const query = this.db
      .select()
      .from(escalations)
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(filters.limit || 20)
      .offset(filters.offset || 0);

    return await query;
  }

  async getEscalationsWithFiltersPriority(filters: GetEscalationsFilters) {
    // For priority filtering, we need to filter on metadata->priority
    const conditions = [eq(escalations.userId, filters.userId)];

    // Status filter
    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(escalations.status, filters.status));
    }

    // Priority filter
    if (filters.priority && filters.priority.length > 0) {
      conditions.push(inArray(escalations.priority, filters.priority));
    }

    // Search filter
    if (filters.search) {
      conditions.push(like(escalations.reason, `%${filters.search}%`));
    }

    // Date range filters
    this.addDateRangeConditions(conditions, filters.dateFrom, filters.dateTo);

    // Build sort order
    const sortColumn = filters.sortBy || 'createdAt';
    const sortDirection = filters.sortOrder === 'asc' ? asc : desc;
    let orderByClause;

    if (sortColumn === 'createdAt') {
      orderByClause = sortDirection(escalations.createdAt);
    } else if (sortColumn === 'resolvedAt') {
      orderByClause = sortDirection(escalations.resolvedAt);
    } else if (sortColumn === 'priority') {
      orderByClause = sortDirection(escalations.priority);
    } else {
      orderByClause = desc(escalations.createdAt);
    }

    const query = this.db
      .select()
      .from(escalations)
      .where(and(...conditions))
      .orderBy(orderByClause)
      .limit(filters.limit || 20)
      .offset(filters.offset || 0);

    return await query;
  }

  async countEscalationsWithFilters(filters: GetEscalationsFilters): Promise<number> {
    const conditions = [eq(escalations.userId, filters.userId)];

    if (filters.status && filters.status.length > 0) {
      conditions.push(inArray(escalations.status, filters.status));
    }

    if (filters.priority && filters.priority.length > 0) {
      conditions.push(inArray(escalations.priority, filters.priority));
    }

    if (filters.search) {
      conditions.push(like(escalations.reason, `%${filters.search}%`));
    }

    this.addDateRangeConditions(conditions, filters.dateFrom, filters.dateTo);

    const result = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(escalations)
      .where(and(...conditions));

    return result[0]?.count || 0;
  }

  async findById(id: string) {
    const [escalation] = await this.db.select().from(escalations).where(eq(escalations.id, id));
    return escalation;
  }

  async findByIds(ids: string[]) {
    if (!ids.length) {
      return [];
    }
    return this.db
      .select({
        id: escalations.id,
        reason: escalations.reason,
      })
      .from(escalations)
      .where(inArray(escalations.id, ids));
  }

  async findByIdWithDetails(id: string, userId: string) {
    const result = await this.db
      .select({
        escalation: escalations,
        email: emails,
        thread: emailThreads,
      })
      .from(escalations)
      .leftJoin(emailThreads, eq(escalations.threadId, emailThreads.id))
      .leftJoin(emails, eq(emailThreads.id, emails.threadId))
      .where(and(eq(escalations.id, id), eq(escalations.userId, userId)))
      .limit(1);

    if (!result || result.length === 0) {
      return null;
    }

    return {
      ...result[0].escalation,
      email: result[0].email,
      thread: result[0].thread,
    };
  }

  async updateEscalation(
    id: string,
    userId: string,
    data: Partial<typeof escalations.$inferInsert>,
  ) {
    const [updated] = await this.db
      .update(escalations)
      .set(data)
      .where(and(eq(escalations.id, id), eq(escalations.userId, userId)))
      .returning();
    return updated;
  }

  async bulkUpdateStatus(
    ids: string[],
    userId: string,
    status: 'pending' | 'progress' | 'resolved',
  ) {
    const updateData: any = {
      status,
      resolvedAt: new Date(),
    };
    const updated = await this.db
      .update(escalations)
      .set(updateData)
      .where(and(inArray(escalations.id, ids), eq(escalations.userId, userId)))
      .returning();

    return updated;
  }

  async countByStatus(userId: string, status: string): Promise<number> {
    const [result] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(escalations)
      .where(and(eq(escalations.userId, userId), eq(escalations.status, status)));

    return result?.count ?? 0;
  }

  async getStats(userId: string, dateFrom?: string, dateTo?: string) {
    const conditions = [eq(escalations.userId, userId)];
    this.addDateRangeConditions(conditions, dateFrom, dateTo);

    // Total count
    const totalResult = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(escalations)
      .where(and(...conditions));

    // Count by status
    const statusResult = await this.db
      .select({
        status: escalations.status,
        count: sql<number>`count(*)::int`,
      })
      .from(escalations)
      .where(and(...conditions))
      .groupBy(escalations.status);

    // Count by priority
    const priorityResult = await this.db
      .select({
        priority: escalations.priority,
        count: sql<number>`count(*)::int`,
      })
      .from(escalations)
      .where(and(...conditions))
      .groupBy(escalations.priority);

    return {
      total: totalResult[0]?.count || 0,
      byStatus: statusResult,
      byPriority: priorityResult,
    };
  }
}
