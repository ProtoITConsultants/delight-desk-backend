import { eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../../database/database.module';
import { billingPlans } from '../../../database/schema/billing_plan.schema';

@Injectable()
export class PlansRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  findAll() {
    return this.db.select().from(billingPlans);
  }

  async findPlanByName(name: string) {
    const [plan] = await this.db.select().from(billingPlans).where(eq(billingPlans.name, name));
    return plan;
  }
}
