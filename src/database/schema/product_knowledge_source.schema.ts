import { InferSelectModel } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './user.schema';

export const productKnowledgeSources = pgTable(
  'product_knowledge_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceType: varchar('source_type', { length: 20 }).notNull(), // manual | url
    title: text('title').notNull(),
    sourceUrl: text('source_url'),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 30 }).notNull().default('processing'), // processing | ready | failed
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('product_knowledge_sources_user_id_idx').on(t.userId),
    index('product_knowledge_sources_content_hash_idx').on(t.userId, t.contentHash),
    index('product_knowledge_sources_status_idx').on(t.userId, t.status),
  ],
);

export type ProductKnowledgeSourceEntity = InferSelectModel<typeof productKnowledgeSources>;
