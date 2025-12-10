import { eq } from 'drizzle-orm';
import { systemSettings } from '../schema';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.module';

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
}
