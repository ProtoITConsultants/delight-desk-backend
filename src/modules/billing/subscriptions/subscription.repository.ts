import { eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { subscriptions } from '../../../database/schema/index';
import { DATABASE_CONNECTION } from 'src/database/database.module';

@Injectable()
export class SubscriptionRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async createSubscription(dto: any) {
    const [result] = await this.db.insert(subscriptions).values(dto).returning();
    return result;
  }

  async getSubscriptionsForUser(userId: string) {
    return this.db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
  }

  async insertIfNotExists(payload: any) {
    const existing = await this.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, payload.userId))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const [created] = await this.db.insert(subscriptions).values(payload).returning();

    return created;
  }
}
