import { eq, sql } from 'drizzle-orm';
import { systemSettings } from '../schema';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';

@Injectable()
export class SystemSettingsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}
  async findByUser(userId: string) {
    const rows = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.userId, userId));

    return rows[0] ?? null;
  }

  async update(userId: string, dto: any) {
    await this.db.update(systemSettings).set(dto).where(eq(systemSettings.userId, userId));
  }

  async upsert(userId: string, dto: any) {
    await this.db
      .insert(systemSettings)
      .values({ userId, ...dto })
      .onConflictDoUpdate({
        target: systemSettings.userId,
        set: { ...dto, updatedAt: sql`now()` },
      });
  }

  /**
   * Stamps the row with the moment the WooCommerce -> Delight Desk promo code backfill
   * completed. Used by `WooCommerceCouponSyncService.runFullBackfillOnEnable` to make
   * the backfill idempotent — once set, re-enabling the agent will not re-import.
   * Uses upsert so we never crash if a system_settings row hasn't been created yet.
   */
  async markPromoCodeAgentInitialized(userId: string, when: Date = new Date()) {
    await this.upsert(userId, { promoCodeAgentInitializedAt: when });
  }
}
