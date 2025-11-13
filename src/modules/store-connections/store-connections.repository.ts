// src/modules/store-connections/store-connections.repository.ts
import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { storeConnections } from 'src/database/schema/storeConnections';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';


@Injectable()
export class StoreConnectionsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  // Create a new store connection
  async create(data: Omit<typeof storeConnections.$inferInsert, 'id' | 'created_at' | 'updated_at'>) {
    const [connection] = await this.db
      .insert(storeConnections)
      .values({
        ...data,
        userid: String(data.userid), // ensure string
      })
      .returning();
    return connection;
  }

  // Get all connections for a specific user
  async findAllByUser(userId: string) {
    return this.db
      .select()
      .from(storeConnections)
      .where(eq(storeConnections.userid, userId));
  }

  // Get connection by id and user
  async findById(id: string, userId: string) {
    const [connection] = await this.db
      .select()
      .from(storeConnections)
      .where(and(eq(storeConnections.id, id), eq(storeConnections.userid, userId)));
    return connection ?? null;
  }

  // Update a connection
  async update(id: string, userId: string, data: Partial<typeof storeConnections.$inferInsert>) {
    const [updated] = await this.db
      .update(storeConnections)
      .set({ ...data, updated_at: new Date() })
      .where(and(eq(storeConnections.id, id), eq(storeConnections.userid, userId)))
      .returning();
    return updated ?? null;
  }

  // Delete a connection
  async delete(id: string, userId: string) {
    const [deleted] = await this.db
      .delete(storeConnections)
      .where(and(eq(storeConnections.id, id), eq(storeConnections.userid, userId)))
      .returning();
    return deleted ?? null;
  }
  
  async findByPlatform(userId: string, platform: string) {
    const [connection] = await this.db
      .select()
      .from(storeConnections)
      .where(and(eq(storeConnections.userid, userId), eq(storeConnections.platform, platform)));

    return connection ?? null;
  }

  async findByOAuthToken(token: string) {
    const [connection] = await this.db
      .select()
      .from(storeConnections)
      .where(eq(storeConnections.oauth_token, token));

    return connection || null;
  }

  async updateOAuthTokens(id: string, userId: string, data: Partial<typeof storeConnections.$inferInsert>) {
    const [updated] = await this.db
      .update(storeConnections)
      .set({
        ...data,
        updated_at: new Date(),
      })
      .where(
        and(
          eq(storeConnections.id, String(id)),
          eq(storeConnections.userid, userId),
        )
      )
      .returning();
    return updated ?? null;
  }

  async findByPlatformAndMethod(userId: string, platform: string, connectionMethod: string) {
    const [connection] = await this.db
      .select()
      .from(storeConnections)
      .where(
        and(
          eq(storeConnections.userid, userId),
          eq(storeConnections.platform, platform),
          eq(storeConnections.connection_method, connectionMethod)
        )
      );

    return connection ?? null;
  }
}
