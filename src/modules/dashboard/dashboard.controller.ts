import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import {
  DashboardAnalyticsRange,
  DashboardAnalyticsResponseDto,
  GetDashboardAnalyticsDto,
} from './dashboard.dto';

@ApiTags('Dashboard')
@ApiCookieAuth('connect.sid')
@UseGuards(SessionGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('analytics')
  @ApiOperation({
    summary: 'Get Mission Control analytics',
    description:
      'Returns the four Mission Control metrics (AI Agent Actions Completed, AI Assistant Tickets Resolved, Total Emails Received, Estimated Time Saved) for the authenticated user, filtered by the selected time range (today, last 7 days, last 30 days, or last 365 days).',
  })
  @ApiOkResponse({
    description: 'Dashboard analytics retrieved successfully',
    type: DashboardAnalyticsResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getAnalytics(
    @CurrentUserId() userId: string,
    @Query() dto: GetDashboardAnalyticsDto,
  ): Promise<DashboardAnalyticsResponseDto> {
    return this.dashboardService.getAnalytics(userId, dto.range ?? DashboardAnalyticsRange.TODAY);
  }
}
