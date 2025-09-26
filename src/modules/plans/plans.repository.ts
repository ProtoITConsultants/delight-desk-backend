import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { billingPlans } from '../../database/schema/billing_plan.schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

@Injectable()
export class PlansRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  findAll() {
    return this.db.select().from(billingPlans);
  }
}
