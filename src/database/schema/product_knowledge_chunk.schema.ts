import { InferSelectModel } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { productKnowledgeSources } from './product_knowledge_source.schema';

export const productKnowledgeChunks = pgTable(
  'product_knowledge_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => productKnowledgeSources.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('product_knowledge_chunks_user_id_idx').on(t.userId),
    index('product_knowledge_chunks_source_id_idx').on(t.sourceId),
    uniqueIndex('product_knowledge_chunks_source_index_uidx').on(t.sourceId, t.chunkIndex),
  ],
);

export type ProductKnowledgeChunkEntity = InferSelectModel<typeof productKnowledgeChunks>;
