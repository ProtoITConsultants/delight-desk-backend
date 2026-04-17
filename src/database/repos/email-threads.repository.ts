import { desc, eq, inArray } from 'drizzle-orm';
import { emailThreads, emails } from '../schema';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DATABASE_CONNECTION } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class EmailThreadsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async findById(id: string) {
    const [thread] = await this.db.select().from(emailThreads).where(eq(emailThreads.id, id));

    return thread;
  }

  /**
   * Batch-fetch thread metadata for many ids at once.
   * Returns an empty array when ids is empty.
   */
  async findByIds(ids: string[]) {
    if (!ids.length) {
      return [];
    }
    return this.db.select().from(emailThreads).where(inArray(emailThreads.id, ids));
  }

  /**
   * Resolve the email provider ('google' | 'microsoft') for a given provider-native
   * message ID by joining the emails and email_threads tables.
   * Returns 'google' as a safe default when no match is found.
   */
  async getProviderByMessageId(messageId: string): Promise<string> {
    const [row] = await this.db
      .select({ provider: emailThreads.provider })
      .from(emails)
      .innerJoin(emailThreads, eq(emails.threadId, emailThreads.id))
      .where(eq(emails.messageId, messageId))
      .limit(1);

    return row?.provider ?? 'google';
  }

  /**
   * Return the provider-native message ID of the most-recently received email in a thread.
   * Used by the Outlook reply path to avoid an unreliable Graph API $filter query.
   */
  async findLatestMessageIdByInternalThreadId(internalThreadId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ messageId: emails.messageId })
      .from(emails)
      .where(eq(emails.threadId, internalThreadId))
      .orderBy(desc(emails.internalDate))
      .limit(1);

    return row?.messageId ?? null;
  }

  async updateById(id: string, data: Partial<typeof emailThreads.$inferInsert>) {
    const [updated] = await this.db
      .update(emailThreads)
      .set(data)
      .where(eq(emailThreads.id, id))
      .returning();

    if (!updated) {
      throw new NotFoundException(`Email thread ${id} not found`);
    }

    return updated;
  }
}
