import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { billingPlans } from '../../database/schema/billing_plan.schema';

@Injectable()
export class PlansRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: any) {}

  async findAll() {
    return await this.db.select().from(billingPlans);
  }
}
