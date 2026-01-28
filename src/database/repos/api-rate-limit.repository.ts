import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { apiRateLimits } from '../schema';

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: Date;
}

@Injectable()
export class ApiRateLimitRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async checkAndGetLimit(
    userId: string,
    endpoint: string,
    limit: number = 5,
    windowMs: number = 604800000, // Default to 1 week
  ): Promise<RateLimitCheckResult> {
    const now = new Date();

    // Find active rate limit record (resetAt > now)
    const [activeLimit] = await this.db
      .select()
      .from(apiRateLimits)
      .where(
        and(
          eq(apiRateLimits.userId, userId),
          eq(apiRateLimits.endpoint, endpoint),
          gt(apiRateLimits.resetAt, now),
        ),
      )
      .limit(1);

    if (!activeLimit) {
      // No active limit, user can make the call
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        resetAt: new Date(now.getTime() + windowMs),
      };
    }

    // Check if limit exceeded
    if (activeLimit.callCount >= activeLimit.limitCount) {
      return {
        allowed: false,
        limit: activeLimit.limitCount,
        remaining: 0,
        resetAt: activeLimit.resetAt,
        retryAfter: activeLimit.resetAt,
      };
    }

    // Limit not exceeded
    return {
      allowed: true,
      limit: activeLimit.limitCount,
      remaining: activeLimit.limitCount - activeLimit.callCount - 1,
      resetAt: activeLimit.resetAt,
    };
  }

  async incrementCount(
    userId: string,
    endpoint: string,
    limit: number = 5,
    windowMs: number = 604800000, // Default to 1 week
  ): Promise<void> {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    // Find active rate limit record
    const [activeLimit] = await this.db
      .select()
      .from(apiRateLimits)
      .where(
        and(
          eq(apiRateLimits.userId, userId),
          eq(apiRateLimits.endpoint, endpoint),
          gt(apiRateLimits.resetAt, now),
        ),
      )
      .limit(1);

    if (activeLimit) {
      // Increment existing record
      await this.db
        .update(apiRateLimits)
        .set({
          callCount: sql`${apiRateLimits.callCount} + 1`,
          updatedAt: now,
        })
        .where(eq(apiRateLimits.id, activeLimit.id));
    } else {
      // Create new record with count = 1
      await this.db.insert(apiRateLimits).values({
        userId,
        endpoint,
        callCount: 1,
        limitCount: limit,
        resetAt,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  async getRemainingCalls(userId: string, endpoint: string, limit: number = 5): Promise<number> {
    const now = new Date();

    const [activeLimit] = await this.db
      .select()
      .from(apiRateLimits)
      .where(
        and(
          eq(apiRateLimits.userId, userId),
          eq(apiRateLimits.endpoint, endpoint),
          gt(apiRateLimits.resetAt, now),
        ),
      )
      .limit(1);

    if (!activeLimit) {
      return limit;
    }

    return Math.max(0, activeLimit.limitCount - activeLimit.callCount);
  }

  async resetLimit(userId: string, endpoint: string): Promise<void> {
    await this.db
      .delete(apiRateLimits)
      .where(and(eq(apiRateLimits.userId, userId), eq(apiRateLimits.endpoint, endpoint)));
  }

  async cleanupExpiredLimits(): Promise<number> {
    const now = new Date();
    // @ts-ignore
    const result = await this.db.delete(apiRateLimits).where(gt(now, apiRateLimits.resetAt));
    return result.rowCount || 0;
  }
}
