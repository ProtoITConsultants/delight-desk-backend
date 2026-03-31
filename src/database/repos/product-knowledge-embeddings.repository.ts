import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { productKnowledgeEmbeddings } from '../schema';
import { sql } from 'drizzle-orm';

export type ProductKnowledgeSimilarityMatch = {
  chunkId: string;
  sourceId: string;
  content: string;
  tokenCount: number;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceType: string;
  similarity: number;
};

@Injectable()
export class ProductKnowledgeEmbeddingsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async createMany(data: Array<typeof productKnowledgeEmbeddings.$inferInsert>) {
    if (data.length === 0) return [];
    return this.db.insert(productKnowledgeEmbeddings).values(data).returning();
  }

  async similaritySearch(params: {
    userId: string;
    queryEmbedding: number[];
    limit: number;
  }): Promise<ProductKnowledgeSimilarityMatch[]> {
    const { userId, queryEmbedding, limit } = params;
    const queryVector = `[${queryEmbedding.join(',')}]`;

    const result = await this.db.execute(sql`
      SELECT
        c.id AS "chunkId",
        c.source_id AS "sourceId",
        c.content AS "content",
        c.token_count AS "tokenCount",
        s.title AS "sourceTitle",
        s.source_url AS "sourceUrl",
        s.source_type AS "sourceType",
        (1 - (e.embedding <=> ${queryVector}::vector))::float AS "similarity"
      FROM product_knowledge_embeddings e
      INNER JOIN product_knowledge_chunks c ON c.id = e.chunk_id
      INNER JOIN product_knowledge_sources s ON s.id = c.source_id
      WHERE e.user_id = ${userId}
        AND s.user_id = ${userId}
        AND s.status = 'ready'
      ORDER BY e.embedding <=> ${queryVector}::vector
      LIMIT ${limit}
    `);

    return (result.rows ?? []) as ProductKnowledgeSimilarityMatch[];
  }
}
