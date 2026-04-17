import { and, asc, eq, inArray } from 'drizzle-orm';
import { emails } from '../schema';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class EmailsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async findById(id: string) {
    const [email] = await this.db.select().from(emails).where(eq(emails.id, id));
    return email;
  }

  /**
   * Return all emails belonging to ANY of the given threads, ordered
   * chronologically (oldest first). Used by the paginated
   * "escalations-with-thread" endpoint so we fetch every page's
   * messages in a SINGLE round-trip instead of N+1 queries.
   *
   * Falls back to createdAt when internalDate is missing so newly
   * persisted outgoing replies still appear in order.
   */
  async findAllByThreadIds(threadIds: string[], userId?: string) {
    if (!threadIds.length) {
      return [];
    }

    const conditions = [inArray(emails.threadId, threadIds)];

    if (userId) {
      conditions.push(eq(emails.userId, userId));
    }

    return this.db
      .select()
      .from(emails)
      .where(and(...conditions))
      .orderBy(asc(emails.internalDate), asc(emails.createdAt));
  }

  async update(id: string, updates: any) {
    const [updated] = await this.db
      .update(emails)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(emails.id, id))
      .returning();
    return updated;
  }

  async insertEmailIfNotExists(emailPayload: any) {
    try {
      const [inserted] = await this.db.insert(emails).values(emailPayload).returning();
      return { inserted: true, email: inserted };
    } catch (error) {
      if (error.code === '23505') {
        // Duplicate key
        return { inserted: false, email: null };
      }
      throw error;
    }
  }
}
