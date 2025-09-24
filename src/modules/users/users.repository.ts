import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { users } from 'src/database/schema/user.schema';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class UserRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async create(data: any) {
    const [user] = await this.db.insert(users).values(data).returning();
    return user;
  }

  async findAll() {
    return this.db.select().from(users);
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
}
