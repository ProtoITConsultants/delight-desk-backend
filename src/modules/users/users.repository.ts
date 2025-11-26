import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from 'src/database/schema/user.schema';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';

@Injectable()
export class UserRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async create(data: any) {
    const [user] = await this.db.insert(users).values(data).returning();
    return user;
  }

  async findById(id: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  }

  async findByEmail(email: string) {
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    return user ?? null;
  }

  async update(id: string, data: Partial<any>) {
    if (!data || Object.keys(data).length === 0) {
      throw new Error('No fields provided for update');
    }
    const [updated] = await this.db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated ?? null;
  }

  async delete(id: string) {
    const [deleted] = await this.db.delete(users).where(eq(users.id, id)).returning();
    return deleted ?? null;
  }

  async findByResetToken(token: string) {
    const [user] = await this.db.select().from(users).where(eq(users.passwordResetToken, token));
    return user ?? null;
  }

  async findByIdBasic(id: string) {
    return this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
  }

  async isAdmin(id: string) {
    const row = await this.db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return row[0]?.role === 'admin';
  }

  async deleteById(id: string) {
    await this.db.delete(users).where(eq(users.id, id));
    return true;
  }

  async countUsers(conditions: any, userId: string) {
    const query = sql`
    SELECT COUNT(*) AS total
    FROM users u
    WHERE ${conditions}
      AND u.id <> ${userId}
  `;
    const result = await this.db.execute(query);
    return Number(result.rows[0].total);
  }

  async getUsers(conditions: any, limit: number, offset: number, userId: string) {
    const query = sql`
    SELECT
      u.id,
      u.email,
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.phone,
      u.last_login_at AS "lastLoginAt",
      o.oauth_account AS "oauthAccount",
      s.store_connection AS "storeConnection",
      sb.subscription_plan_name AS "subscriptionPlanName"
    FROM users u

    -- Single OAuth row
    LEFT JOIN LATERAL (
      SELECT json_build_object(
        'id', oa.id,
        'provider', oa.provider,
        'email', oa.email,
        'status', oa.status,
        'providerUserId', oa.provider_user_id,
        'createdAt', oa.created_at
      ) AS oauth_account
      FROM user_oauth_accounts oa
      WHERE oa.user_id = u.id
      LIMIT 1
    ) o ON TRUE

    -- Single Store row
    LEFT JOIN LATERAL (
      SELECT json_build_object(
        'id', sc.id,
        'platform', sc.platform,
        'storeUrl', sc.store_url,
        'isActive', sc.is_active,
        'createdAt', sc.created_at
      ) AS store_connection
      FROM user_store_connections sc
      WHERE sc.user_id = u.id
      LIMIT 1
    ) s ON TRUE

    -- Single subscription plan name only
    LEFT JOIN LATERAL (
      SELECT bp.name AS subscription_plan_name
      FROM subscriptions sub
      JOIN billing_plans bp ON bp.id = sub.plan_id
      WHERE sub.user_id = u.id
      ORDER BY sub.created_at DESC
      LIMIT 1
    ) sb ON TRUE

    WHERE ${conditions}
      AND u.id <> ${userId}

    ORDER BY u.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

    const result = await this.db.execute(query);
    return result.rows ?? [];
  }

  async deleteSessionsByUserId(userId: string) {
    const result: any = await this.db.execute(sql`SELECT sid, sess FROM user_sessions`);

    if (!result?.rows?.length) return;

    const sidsToDelete: string[] = [];

    for (const row of result.rows) {
      try {
        const data = JSON.parse(row.sess);
        if (data?.userId === userId) {
          sidsToDelete.push(row.sid);
        }
      } catch {
        continue;
      }
    }

    if (sidsToDelete.length === 0) return;

    await this.db.execute(sql`DELETE FROM user_sessions WHERE sid = ANY(${sidsToDelete})`);

    return true;
  }
}
