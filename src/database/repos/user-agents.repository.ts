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
    return this.db
      .update(userAgents)
      .set({
        ...(fields.isEnabled !== undefined && { isEnabled: fields.isEnabled }),
        ...(fields.requiresModeration !== undefined && {
          requiresModeration: fields.requiresModeration,
        }),
        updatedAt: new Date(),
      })
      .where(and(eq(userAgents.userId, userId), eq(userAgents.agentId, agentId)));
  }
}
