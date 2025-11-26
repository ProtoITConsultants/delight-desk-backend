import { Module } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { SubscriptionRepository } from './subscription.repository';
import { SubscriptionController } from './subscription.controller';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, SubscriptionRepository],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
