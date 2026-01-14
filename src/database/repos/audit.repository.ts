import { desc, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION } from '../database.module';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { executionSummaries, pipelineExecutionLogs } from '../schema';

@Injectable()
export class AuditRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async createLog(log: any) {
    const [created] = await this.db.insert(pipelineExecutionLogs).values(log).returning();
    return created;
  }

  async getLogsByExecution(executionId: string) {
    return this.db
      .select()
      .from(pipelineExecutionLogs)
      .where(eq(pipelineExecutionLogs.executionId, executionId))
      .orderBy(pipelineExecutionLogs.timestamp);
  }

  async getLogsByEmail(emailId: string) {
    return this.db
      .select()
      .from(pipelineExecutionLogs)
      .where(eq(pipelineExecutionLogs.emailId, emailId))
      .orderBy(desc(pipelineExecutionLogs.timestamp));
  }

  async createExecutionSummary(summary: any) {
    const [created] = await this.db.insert(executionSummaries).values(summary).returning();
    return created;
  }

  async updateExecutionSummary(executionId: string, updates: any) {
    const [updated] = await this.db
      .update(executionSummaries)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(executionSummaries.executionId, executionId))
      .returning();
    return updated;
  }
}
