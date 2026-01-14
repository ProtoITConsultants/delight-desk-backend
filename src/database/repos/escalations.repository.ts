import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { escalations } from '../schema';

@Injectable()
export class EscalationsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  createEscalation(data: any) {
    this.db.insert(escalations).values(data);
  }

  async getAllEscalationsForUserId(userId: string) {
    return this.db.select().from(escalations).where(eq(escalations.userId, userId));
  }

  async updateEscalation(id: string, data: any) {}
}
