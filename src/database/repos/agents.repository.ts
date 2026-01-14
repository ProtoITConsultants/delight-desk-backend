import { and, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AgentEntity, agents, userAgents } from '../schema';
import { DATABASE_CONNECTION } from '../../database/database.module';

@Injectable()
export class AgentsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async getAgentById(agentId: string): Promise<AgentEntity> {
    const row = await this.db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    return row[0];
  }

  async getAgentsForUser(userId: string) {
    const rows = await this.db
      .select({
        id: agents.id,
        name: agents.name,
        type: agents.type,
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
      type: row.type,
      description: row.description,
      icon: row.icon,
      isEnabled: row.isEnabled ?? false,
      requiresModeration: row.requiresModeration ?? false,
    }));
  }
}
