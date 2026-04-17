import { Controller, ForbiddenException, Get, Param, UseGuards } from '@nestjs/common';

import { SubscriptionService } from './subscription.service';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @UseGuards(SessionGuard)
  @Get('subscriptions/:userId')
  /** Only the signed-in user may read their own subscription rows (IDOR prevention). */
  getUserSubscriptions(
    @Param('userId') userId: string,
    @CurrentUserId() sessionUserId: string,
  ) {
    if (userId !== sessionUserId) {
      throw new ForbiddenException('Access denied');
    }
    return this.subscriptionService.getUserSubscriptions(userId);
  }
}
