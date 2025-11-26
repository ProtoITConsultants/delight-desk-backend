import { PlansService } from './plans.service';
import { Controller, Get } from '@nestjs/common';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  findAll() {
    return this.plansService.getAllPlans();
  }
}
