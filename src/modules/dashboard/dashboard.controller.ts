import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import {
  DashboardAnalyticsRange,
  DashboardAnalyticsResponseDto,
  GetDashboardAnalyticsDto,
} from './dashboard.dto';

@UseGuards(SessionGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('analytics')
  getAnalytics(
    @CurrentUserId() userId: string,
    @Query() dto: GetDashboardAnalyticsDto,
  ): Promise<DashboardAnalyticsResponseDto> {
    return this.dashboardService.getAnalytics(userId, dto.range ?? DashboardAnalyticsRange.TODAY);
  }
}
