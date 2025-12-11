import { eq, and } from 'drizzle-orm';
import { userAgents } from '../schema';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.module';

@Injectable()
export class UserAgentsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async findByUserAndAgent(userId: string, agentId: string) {
    const rows = await this.db
      .select()
      .from(userAgents)
      .where(and(eq(userAgents.userId, userId), eq(userAgents.agentId, agentId)));

    return rows[0] ?? null;
  }

  async update(
    userId: string,
    agentId: string,
    fields: {
      isEnabled?: boolean;
      requiresModeration?: boolean;
    },
  ) {
    const updates: Partial<typeof userAgents.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (fields.isEnabled !== undefined) {
      updates.isEnabled = fields.isEnabled;
    }

    if (fields.requiresModeration !== undefined) {
      updates.requiresModeration = fields.requiresModeration;
    }

    await this.db
      .update(userAgents)
      .set(updates)
      .where(and(eq(userAgents.userId, userId), eq(userAgents.agentId, agentId)));
  }
}
