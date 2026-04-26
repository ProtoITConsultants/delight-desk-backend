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

  /**
   * Direct lookup by id without scoping to a user; used by the sync cron which iterates
   * every configuration across all tenants. Caller still respects userId for tenant safety.
   */
  async findById(id: string): Promise<PromoCodeConfigurationEntity | null> {
    const rows = await this.db
      .select()
      .from(promoCodeConfigurations)
      .where(eq(promoCodeConfigurations.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async findActiveByCode(
    userId: string,
    promoCode: string,
  ): Promise<PromoCodeConfigurationEntity | null> {
    const rows = await this.db
      .select()
      .from(promoCodeConfigurations)
      .where(
        and(
          eq(promoCodeConfigurations.userId, userId),
          eq(promoCodeConfigurations.promoCode, promoCode),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Lists every configuration in the system. Intended for the WooCommerce coupon
   * reconciliation cron job which fans out per-user.
   */
  async listAll(): Promise<PromoCodeConfigurationEntity[]> {
    return this.db.select().from(promoCodeConfigurations);
  }

  /**
   * Updates only the WooCommerce sync bookkeeping fields (coupon id, last successful
   * sync timestamp, last error) without touching user-managed fields. Bypasses the
   * userId guard because the sync service trusts the configuration row it loaded.
   */
  async updateSyncMetadata(
    id: string,
    updates: {
      wooCommerceCouponId?: number | null;
      lastSyncedAt?: Date | null;
      lastSyncError?: string | null;
    },
  ): Promise<void> {
    await this.db
      .update(promoCodeConfigurations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(promoCodeConfigurations.id, id));
  }
}
