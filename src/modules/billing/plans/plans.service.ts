import { Injectable } from '@nestjs/common';
import { PlansRepository } from 'src/database/repos/plans.repository';

@Injectable()
export class PlansService {
  constructor(private readonly plansRepo: PlansRepository) {}

  getAllPlans() {
    return this.plansRepo.findAll();
  }
}
