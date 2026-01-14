import { eq } from 'drizzle-orm';
import { emailThreads } from '../schema';
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
