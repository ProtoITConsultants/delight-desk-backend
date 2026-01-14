import { eq } from 'drizzle-orm';
import { emails } from '../schema';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class EmailsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async findById(id: string) {
    const [email] = await this.db.select().from(emails).where(eq(emails.id, id));
    return email;
  }

  async update(id: string, updates: any) {
    const [updated] = await this.db
      .update(emails)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(emails.id, id))
      .returning();
    return updated;
  }

  async insertEmailIfNotExists(emailPayload: any) {
    try {
      const [inserted] = await this.db.insert(emails).values(emailPayload).returning();
      return { inserted: true, email: inserted };
    } catch (error) {
      if (error.code === '23505') {
        // Duplicate key
        return { inserted: false, email: null };
      }
      throw error;
    }
  }
}
