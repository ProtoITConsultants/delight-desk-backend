import { and, desc, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { productKnowledgeSources } from '../schema';

@Injectable()
export class ProductKnowledgeSourcesRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async create(data: typeof productKnowledgeSources.$inferInsert) {
    const [created] = await this.db.insert(productKnowledgeSources).values(data).returning();
    return created;
  }

  async findByUserAndHash(userId: string, contentHash: string) {
    const [source] = await this.db
      .select()
      .from(productKnowledgeSources)
      .where(
        and(
          eq(productKnowledgeSources.userId, userId),
          eq(productKnowledgeSources.contentHash, contentHash),
        ),
      )
      .limit(1);

    return source ?? null;
  }

  async findById(userId: string, id: string) {
    const [source] = await this.db
      .select()
      .from(productKnowledgeSources)
      .where(and(eq(productKnowledgeSources.userId, userId), eq(productKnowledgeSources.id, id)))
      .limit(1);

    return source ?? null;
  }

  async findLatestByUserAndSourceUrl(userId: string, sourceUrl: string) {
    const [source] = await this.db
      .select()
      .from(productKnowledgeSources)
      .where(
        and(eq(productKnowledgeSources.userId, userId), eq(productKnowledgeSources.sourceUrl, sourceUrl)),
      )
      .orderBy(desc(productKnowledgeSources.updatedAt))
      .limit(1);

    return source ?? null;
  }

  async listByUser(userId: string, status?: 'processing' | 'ready' | 'failed') {
    if (status) {
      return this.db
        .select()
        .from(productKnowledgeSources)
        .where(
          and(eq(productKnowledgeSources.userId, userId), eq(productKnowledgeSources.status, status)),
        )
        .orderBy(desc(productKnowledgeSources.createdAt));
    }

    return this.db
      .select()
      .from(productKnowledgeSources)
      .where(eq(productKnowledgeSources.userId, userId))
      .orderBy(desc(productKnowledgeSources.createdAt));
  }

  async updateStatus(
    userId: string,
    sourceId: string,
    status: 'processing' | 'ready' | 'failed',
    metadata?: Record<string, unknown>,
  ) {
    const [updated] = await this.db
      .update(productKnowledgeSources)
      .set({
        status,
        metadata,
        updatedAt: new Date(),
      })
      .where(and(eq(productKnowledgeSources.userId, userId), eq(productKnowledgeSources.id, sourceId)))
      .returning();

    return updated ?? null;
  }

  async updateForReingestion(params: {
    userId: string;
    sourceId: string;
    title: string;
    sourceUrl: string;
    contentHash: string;
    metadata?: Record<string, unknown>;
  }) {
    const [updated] = await this.db
      .update(productKnowledgeSources)
      .set({
        title: params.title,
        sourceUrl: params.sourceUrl,
        contentHash: params.contentHash,
        status: 'processing',
        metadata: params.metadata,
        updatedAt: new Date(),
      })
      .where(
        and(eq(productKnowledgeSources.userId, params.userId), eq(productKnowledgeSources.id, params.sourceId)),
      )
      .returning();

    return updated ?? null;
  }

  async deleteById(userId: string, sourceId: string) {
    const [deleted] = await this.db
      .delete(productKnowledgeSources)
      .where(and(eq(productKnowledgeSources.userId, userId), eq(productKnowledgeSources.id, sourceId)))
      .returning();

    return deleted ?? null;
  }
}
