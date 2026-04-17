import { Controller, Get, MessageEvent, Query, Sse, UseGuards } from '@nestjs/common';

import { Observable } from 'rxjs';
import { CurrentUserId } from '../../../decorators/current-user.decorator';
import { SessionGuard } from '../../../guards/session.guard';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogResponseDto, GetActivityLogDto } from './activity-log.dto';

@UseGuards(SessionGuard)
@Controller('dashboard/activity-log')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  async getActivityLog(
    @CurrentUserId() userId: string,
    @Query() dto: GetActivityLogDto,
  ): Promise<ActivityLogResponseDto> {
    return this.activityLogService.getActivityLog(userId, dto);
  }

  @Sse('stream')
  streamActivityLog(@CurrentUserId() userId: string): Observable<MessageEvent> {
    return this.activityLogService.streamActivityLog(userId);
  }

  @Get('stream/stats')
  getStreamStats() {
    return this.activityLogService.getStreamStats();
  }
}
