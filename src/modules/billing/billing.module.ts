import { Module } from '@nestjs/common';
import { PlansService } from './plans/plans.service';
import { PlansController } from './plans/plans.controller';
import { DatabaseModule } from 'src/database/database.module';
import { PlansRepository } from '../../database/repos/plans.repository';
import { SubscriptionService } from './subscriptions/subscription.service';
import { SubscriptionController } from './subscriptions/subscription.controller';
import { SubscriptionRepository } from '../../database/repos/subscription.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [SubscriptionController, PlansController],
  providers: [PlansService, SubscriptionService, PlansRepository, SubscriptionRepository],
  exports: [PlansService, SubscriptionService],
})
export class BillingModule {}
