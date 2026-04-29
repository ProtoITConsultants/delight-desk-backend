import { and, desc, eq, sql } from 'drizzle-orm';
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

  /**
   * Paginated variant of listByUserId. Uses the `count(*) over()` window function so
   * we get the page slice and the total row count in a single query rather than
   * issuing a separate COUNT query. Matches the pattern used by the approval queue
   * and other list endpoints elsewhere in the codebase.
   *
   * Returns the raw entity shape — the service is responsible for wrapping it in
   * the paginated response envelope so DTO concerns stay in the agents module.
   */
  async listByUserIdPaginated(
    userId: string,
    options: { offset: number; limit: number },
  ): Promise<{ items: PromoCodeConfigurationEntity[]; totalItems: number }> {
    const rows = await this.db
      .select({
        configuration: promoCodeConfigurations,
        totalItems: sql<number>`count(*) over()::int`,
      })
      .from(promoCodeConfigurations)
      .where(eq(promoCodeConfigurations.userId, userId))
      .orderBy(desc(promoCodeConfigurations.createdAt))
      .limit(options.limit)
      .offset(options.offset);

    if (rows.length === 0) {
      return { items: [], totalItems: 0 };
    }

    return {
      items: rows.map((row) => row.configuration),
      totalItems: rows[0].totalItems,
    };
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
   * Looks up a row by the WooCommerce coupon id we recorded during sync. Used by the
   * backfill so we can detect "this WC coupon is already linked to a DD config" and
   * avoid creating duplicates when a merchant re-enables the agent.
   */
  async findByUserAndWooCouponId(
    userId: string,
    wooCommerceCouponId: number,
  ): Promise<PromoCodeConfigurationEntity | null> {
    const rows = await this.db
      .select()
      .from(promoCodeConfigurations)
      .where(
        and(
          eq(promoCodeConfigurations.userId, userId),
          eq(promoCodeConfigurations.wooCommerceCouponId, wooCommerceCouponId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /**
   * Case-insensitive lookup by code, used during the WooCommerce -> Delight Desk
   * backfill to detect when a merchant has the same code defined in both systems
   * (so we link the existing row instead of creating a duplicate). Kept distinct
   * from `findActiveByCode` because the agent's intent classifier still expects
   * exact-match semantics on user-authored codes.
   */
  async findByUserAndCodeCaseInsensitive(
    userId: string,
    promoCode: string,
  ): Promise<PromoCodeConfigurationEntity | null> {
    const rows = await this.db
      .select()
      .from(promoCodeConfigurations)
      .where(
        and(
          eq(promoCodeConfigurations.userId, userId),
          sql`lower(${promoCodeConfigurations.promoCode}) = lower(${promoCode})`,
        ),
      )
      .limit(1);
    return rows[0] ?? null;
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
