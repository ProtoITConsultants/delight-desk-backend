import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agents, users } from './index';

export const userAgents = pgTable('user_agents', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),

  isEnabled: boolean('is_enabled').default(false).notNull(),
  requiresModeration: boolean('requires_moderation').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
