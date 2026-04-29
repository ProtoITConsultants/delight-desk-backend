import { and, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  wooCommerceWebhookSubscriptions,
  WooCommerceWebhookSubscriptionEntity,
} from '../schema';
import { DATABASE_CONNECTION } from '../database.module';

type WooCommerceWebhookSubscriptionCreateInput = Omit<
  WooCommerceWebhookSubscriptionEntity,
  'id' | 'createdAt' | 'updatedAt' | 'lastEventAt' | 'registeredAt'
> &
  Partial<Pick<WooCommerceWebhookSubscriptionEntity, 'registeredAt' | 'lastEventAt'>>;

/**
 * CRUD for `woocommerce_webhook_subscriptions`. Used by the Promo Code Agent's
 * webhook lifecycle: register on agent enable, look up secret on incoming delivery,
 * unregister on agent disable.
 */
@Injectable()
export class WooCommerceWebhookSubscriptionsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async listByUser(userId: string): Promise<WooCommerceWebhookSubscriptionEntity[]> {
    return this.db
      .select()
      .from(wooCommerceWebhookSubscriptions)
      .where(eq(wooCommerceWebhookSubscriptions.userId, userId));
  }

  async findByUserAndTopic(
    userId: string,
    topic: string,
  ): Promise<WooCommerceWebhookSubscriptionEntity | null> {
    const rows = await this.db
      .select()
      .from(wooCommerceWebhookSubscriptions)
      .where(
        and(
          eq(wooCommerceWebhookSubscriptions.userId, userId),
          eq(wooCommerceWebhookSubscriptions.topic, topic),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async create(
    data: WooCommerceWebhookSubscriptionCreateInput,
  ): Promise<WooCommerceWebhookSubscriptionEntity> {
    const rows = await this.db
      .insert(wooCommerceWebhookSubscriptions)
      .values(data)
      .returning();
    return rows[0];
  }

  async deleteByUser(userId: string): Promise<number> {
    const rows = await this.db
      .delete(wooCommerceWebhookSubscriptions)
      .where(eq(wooCommerceWebhookSubscriptions.userId, userId))
      .returning({ id: wooCommerceWebhookSubscriptions.id });
    return rows.length;
  }

  async deleteById(id: string): Promise<void> {
    await this.db
      .delete(wooCommerceWebhookSubscriptions)
      .where(eq(wooCommerceWebhookSubscriptions.id, id));
  }

  /**
   * Stamps `last_event_at` so the UI / diagnostics can spot silent delivery failures.
   * Bypasses userId scoping because the caller already verified the secret matches
   * the subscription row it loaded.
   */
  async stampLastEventAt(id: string, when: Date = new Date()): Promise<void> {
    await this.db
      .update(wooCommerceWebhookSubscriptions)
      .set({ lastEventAt: when, updatedAt: new Date() })
      .where(eq(wooCommerceWebhookSubscriptions.id, id));
  }
}
