import { Controller, Get, MessageEvent, Query, Sse, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { CurrentUserId } from '../../../decorators/current-user.decorator';
import { SessionGuard } from '../../../guards/session.guard';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogResponseDto, GetActivityLogDto } from './activity-log.dto';

@ApiTags('Dashboard')
@ApiCookieAuth('connect.sid')
@UseGuards(SessionGuard)
@Controller('dashboard/activity-log')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  @ApiOperation({
    summary: 'Get dashboard activity log',
    description:
      'Paginated feed of actions taken by AI agents and humans for the authenticated user, ordered by most recent state change. Powers the "Activity Log" card on the dashboard.',
  })
  @ApiOkResponse({
    description: 'Activity log retrieved successfully',
    type: ActivityLogResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getActivityLog(
    @CurrentUserId() userId: string,
    @Query() dto: GetActivityLogDto,
  ): Promise<ActivityLogResponseDto> {
    return this.activityLogService.getActivityLog(userId, dto);
  }

  @Sse('stream')
  @ApiOperation({
    summary: 'Subscribe to activity log updates',
    description:
      'Server-Sent Events stream for the dashboard activity log card. Emits `connected`, `heartbeat`, and `activity_updated` events. Clients should refetch `/dashboard/activity-log` whenever an `activity_updated` event is received.',
  })
  streamActivityLog(@CurrentUserId() userId: string): Observable<MessageEvent> {
    return this.activityLogService.streamActivityLog(userId);
  }

  @Get('stream/stats')
  @ApiOperation({
    summary: 'Get activity log SSE stream stats',
    description:
      'Returns current activity log SSE subscription stats: number of active users and total subscribers. Useful for diagnostics.',
  })
  @ApiResponse({
    status: 200,
    description: 'Stream stats retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        activeUsers: { type: 'number' },
        totalSubscribers: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  getStreamStats() {
    return this.activityLogService.getStreamStats();
  }
}
