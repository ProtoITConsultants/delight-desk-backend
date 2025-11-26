import { Injectable } from '@nestjs/common';
import { PlansRepository } from '../plans/plans.repository';
import { SubscriptionRepository } from './subscription.repository';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly planRepository: PlansRepository,
    private readonly subscriptionRepository: SubscriptionRepository,
  ) {}

  async createSubscriptionManual(userId: string) {
    const solopreneurPlan = await this.planRepository.findPlanByName('solopreneur');
    const dummySubscription = {
      userId: userId,
      planId: solopreneurPlan.id,
      stripeSubscriptionId: 'sub_01HWTZJaj3qg1Kz8yLzY5678',
      status: 'active',
      currentPeriodStart: new Date('2025-01-20T00:00:00.000Z'),
      currentPeriodEnd: new Date('2025-02-20T00:00:00.000Z'),
      cancelAtPeriodEnd: 0,
      resolutionsRemaining: 10,
    };

    return this.subscriptionRepository.insertIfNotExists(dummySubscription);
  }

  async getUserSubscriptions(userId: string) {
    return this.subscriptionRepository.getSubscriptionsForUser(userId);
  }
}
