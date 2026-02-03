import { eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { aiIdentity, AiIdentityEntity } from '../schema';
import { DATABASE_CONNECTION } from '../database.module';

@Injectable()
export class AiIdentityRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async findByUserId(userId: string): Promise<AiIdentityEntity | null> {
    const rows = await this.db
      .select()
      .from(aiIdentity)
      .where(eq(aiIdentity.userId, userId))
      .limit(1);

    return rows[0] || null;
  }

  async create(
    data: Omit<AiIdentityEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AiIdentityEntity> {
    const rows = await this.db.insert(aiIdentity).values(data).returning();

    return rows[0];
  }

  async update(
    userId: string,
    data: Partial<Omit<AiIdentityEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<AiIdentityEntity> {
    const rows = await this.db
      .update(aiIdentity)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(aiIdentity.userId, userId))
      .returning();

    return rows[0];
  }

  async upsert(
    data: Omit<AiIdentityEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AiIdentityEntity> {
    const existing = await this.findByUserId(data.userId);

    if (existing) {
      return this.update(data.userId, data);
    } else {
      return this.create(data);
    }
  }
}
