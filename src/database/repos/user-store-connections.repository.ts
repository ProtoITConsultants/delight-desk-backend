import { eq, and } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { userStoreConnections } from 'src/database/schema/user_store_connection.schema';

@Injectable()
export class UserStoreConnectionsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async create(
    data: Omit<typeof userStoreConnections.$inferInsert, 'id' | 'created_at' | 'updated_at'>,
  ) {
    const [connection] = await this.db
      .insert(userStoreConnections)
      .values({
        ...data,
        userId: String(data.userId),
      })
      .returning();
    return connection;
  }

  async findAllByUser(userId: string) {
    return this.db
      .select()
      .from(userStoreConnections)
      .where(eq(userStoreConnections.userId, userId));
  }

  async findById(id: string, userId: string) {
    const [connection] = await this.db
      .select()
      .from(userStoreConnections)
      .where(and(eq(userStoreConnections.id, id), eq(userStoreConnections.userId, userId)));
    return connection ?? null;
  }

  async update(
    id: string,
    userId: string,
    data: Partial<typeof userStoreConnections.$inferInsert>,
  ) {
    const [updated] = await this.db
      .update(userStoreConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(userStoreConnections.id, id), eq(userStoreConnections.userId, userId)))
      .returning();
    return updated ?? null;
  }

  async delete(id: string, userId: string) {
    const [deleted] = await this.db
      .delete(userStoreConnections)
      .where(and(eq(userStoreConnections.id, id), eq(userStoreConnections.userId, userId)))
      .returning();
    return deleted ?? null;
  }

  async findByPlatform(userId: string, platform: string) {
    const [connection] = await this.db
      .select()
      .from(userStoreConnections)
      .where(
        and(eq(userStoreConnections.userId, userId), eq(userStoreConnections.platform, platform)),
      );

    return connection ?? null;
  }

  async userHasStore(userId: string) {
    const [row] = await this.db
      .select({ id: userStoreConnections.id })
      .from(userStoreConnections)
      .where(eq(userStoreConnections.userId, userId));

    return row != null;
  }
}
