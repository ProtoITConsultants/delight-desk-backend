import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { SendgridModule } from '../sendgrid/sendgrid.module';
import { DatabaseModule } from 'src/database/database.module';
import { PlansRepository } from '../../database/repos/plans.repository';
import { SubscriptionService } from '../billing/subscriptions/subscription.service';
import { SubscriptionRepository } from '../../database/repos/subscription.repository';

@Module({
  imports: [UsersModule, SendgridModule, DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, SubscriptionService, SubscriptionRepository, PlansRepository],
})
export class AuthModule {}
