import { and, eq, inArray } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { productKnowledgeChunks } from '../schema';

@Injectable()
export class ProductKnowledgeChunksRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async createMany(data: Array<typeof productKnowledgeChunks.$inferInsert>) {
    if (data.length === 0) return [];
    return this.db.insert(productKnowledgeChunks).values(data).returning();
  }

  async findBySourceId(userId: string, sourceId: string) {
    return this.db
      .select()
      .from(productKnowledgeChunks)
      .where(
        and(eq(productKnowledgeChunks.userId, userId), eq(productKnowledgeChunks.sourceId, sourceId)),
      )
      .orderBy(productKnowledgeChunks.chunkIndex);
  }

  async deleteBySourceId(userId: string, sourceId: string) {
    return this.db
      .delete(productKnowledgeChunks)
      .where(
        and(eq(productKnowledgeChunks.userId, userId), eq(productKnowledgeChunks.sourceId, sourceId)),
      )
      .returning();
  }

  async findByIds(userId: string, ids: string[]) {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(productKnowledgeChunks)
      .where(and(eq(productKnowledgeChunks.userId, userId), inArray(productKnowledgeChunks.id, ids)));
  }
}
