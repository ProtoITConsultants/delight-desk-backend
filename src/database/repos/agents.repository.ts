import { eq, and } from 'drizzle-orm';
import { agents, userAgents } from '../schema';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.module';

@Injectable()
export class AgentsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}
  async getAgentsForUser(userId: string) {
    const rows = await this.db
      .select({
        id: agents.id,
        name: agents.name,
        description: agents.description,
        icon: agents.icon,
        isEnabled: userAgents.isEnabled,
        requiresModeration: userAgents.requiresModeration,
      })
      .from(agents)
      .leftJoin(userAgents, and(eq(userAgents.agentId, agents.id), eq(userAgents.userId, userId)))
      .execute();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      isEnabled: row.isEnabled ?? false,
      requiresModeration: row.requiresModeration ?? false,
    }));
  }
}
