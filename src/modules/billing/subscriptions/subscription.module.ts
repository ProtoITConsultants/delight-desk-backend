import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { DatabaseModule } from 'src/database/database.module';
import { SubscriptionController } from './subscription.controller';
import { PlansRepository } from 'src/database/repos/plans.repository';
import { SubscriptionRepository } from '../../../database/repos/subscription.repository';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionRepository, PlansRepository, DatabaseModule],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
