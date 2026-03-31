import { InferSelectModel } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.schema';
import { productKnowledgeChunks } from './product_knowledge_chunk.schema';

const vector = customType<{ data: number[]; driverData: string; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
});

export const productKnowledgeEmbeddings = pgTable(
  'product_knowledge_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chunkId: uuid('chunk_id')
      .notNull()
      .references(() => productKnowledgeChunks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    embeddingModel: text('embedding_model').notNull(),
    embeddingDimensions: integer('embedding_dimensions').notNull().default(1536),
    embedding: vector('embedding', { dimensions: 1536 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('product_knowledge_embeddings_user_id_idx').on(t.userId),
    uniqueIndex('product_knowledge_embeddings_chunk_id_uidx').on(t.chunkId),
  ],
);

export type ProductKnowledgeEmbeddingEntity = InferSelectModel<typeof productKnowledgeEmbeddings>;
