import { and, desc, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { promoCodeConfigurations, PromoCodeConfigurationEntity } from '../schema';
import { DATABASE_CONNECTION } from '../database.module';

type PromoCodeConfigurationCreateInput = Omit<
  PromoCodeConfigurationEntity,
  'id' | 'createdAt' | 'updatedAt'
>;

type PromoCodeConfigurationUpdateInput = Partial<
  Omit<PromoCodeConfigurationEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
>;

@Injectable()
export class PromoCodeConfigurationsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async listByUserId(userId: string): Promise<PromoCodeConfigurationEntity[]> {
    return this.db
      .select()
      .from(promoCodeConfigurations)
      .where(eq(promoCodeConfigurations.userId, userId))
      .orderBy(desc(promoCodeConfigurations.createdAt));
  }

  async findByIdAndUserId(
    id: string,
    userId: string,
  ): Promise<PromoCodeConfigurationEntity | null> {
    const rows = await this.db
      .select()
      .from(promoCodeConfigurations)
      .where(and(eq(promoCodeConfigurations.id, id), eq(promoCodeConfigurations.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(data: PromoCodeConfigurationCreateInput): Promise<PromoCodeConfigurationEntity> {
    const rows = await this.db.insert(promoCodeConfigurations).values(data).returning();
    return rows[0];
  }

  async update(
    id: string,
    userId: string,
    updates: PromoCodeConfigurationUpdateInput,
  ): Promise<PromoCodeConfigurationEntity | null> {
    const rows = await this.db
      .update(promoCodeConfigurations)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(promoCodeConfigurations.id, id), eq(promoCodeConfigurations.userId, userId)))
      .returning();
    return rows[0] ?? null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(promoCodeConfigurations)
      .where(and(eq(promoCodeConfigurations.id, id), eq(promoCodeConfigurations.userId, userId)))
      .returning({ id: promoCodeConfigurations.id });
    return rows.length > 0;
  }
}
