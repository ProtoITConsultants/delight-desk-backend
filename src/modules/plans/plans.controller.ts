import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { SessionGuard } from 'src/guards/session.guard';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @UseGuards(SessionGuard)
  @Get()
  async findAll() {
    return this.plansService.getAllPlans();
  }
}
