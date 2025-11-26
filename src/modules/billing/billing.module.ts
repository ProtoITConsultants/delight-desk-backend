import { Module } from '@nestjs/common';
import { PlansService } from './plans/plans.service';
import { PlansRepository } from './plans/plans.repository';
import { DatabaseModule } from 'src/database/database.module';
import { SubscriptionService } from './subscriptions/subscription.service';
import { SubscriptionRepository } from './subscriptions/subscription.repository';
import { SubscriptionController } from './subscriptions/subscription.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [SubscriptionController],
  providers: [PlansService, SubscriptionService, PlansRepository, SubscriptionRepository],
  exports: [PlansService, SubscriptionService],
})
export class BillingModule {}
