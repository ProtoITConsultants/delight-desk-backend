import { Injectable } from '@nestjs/common';
import { PlansRepository } from './plans.repository';

@Injectable()
export class PlansService {
  constructor(private readonly plansRepo: PlansRepository) {}

  async getAllPlans() {
    return this.plansRepo.findAll();
  }
}
