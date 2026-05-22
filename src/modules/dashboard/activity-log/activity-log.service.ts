import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  ActivityLogRepository,
  ActivityLogRow,
} from '../../../database/repos/activity-log.repository';
import { ActivityLogItemDto, ActivityLogResponseDto, GetActivityLogDto } from './activity-log.dto';
import { ActivityLogEventsService } from './activity-log-events.service';
import { ActivityLogStatus } from './activity-log.types';

/**
 * Raw `approval_queue_actions.actionStatus` values that map into each UI
 * status bucket. Kept as a single source of truth so filtering and
 * projection use the same definition.
 */
const STATUS_TO_RAW_STATUSES: Record<ActivityLogStatus, string[]> = {
  [ActivityLogStatus.COMPLETED]: ['executed', 'approved'],
  [ActivityLogStatus.FAILED]: ['failed', 'escalated', 'rejected'],
  [ActivityLogStatus.PENDING]: ['pending_approval', 'executing', 'awaiting_customer_reply'],
  [ActivityLogStatus.CANCELLED]: ['cancelled'],
};

@Injectable()
export class ActivityLogService {
  constructor(
    private readonly activityLogRepository: ActivityLogRepository,
    private readonly activityLogEventsService: ActivityLogEventsService,
  ) {}

  streamActivityLog(userId: string): Observable<MessageEvent> {
    return this.activityLogEventsService.subscribe(userId);
  }

  getStreamStats() {
    return this.activityLogEventsService.getStreamStats();
  }

  async getActivityLog(userId: string, dto: GetActivityLogDto): Promise<ActivityLogResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    const rawStatuses = this.resolveRawStatuses(dto.status);

    const rows = await this.activityLogRepository.getActivityLog({
      userId,
      rawStatuses,
      limit,
      offset,
    });

    const totalItems = rows.length > 0 ? rows[0].totalItems : 0;
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;

    const items = rows.map((row) => this.toItem(row));

    return {
      data: items,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  private resolveRawStatuses(status: ActivityLogStatus | undefined): string[] | undefined {
    if (!status) {
      return undefined;
    }
    return STATUS_TO_RAW_STATUSES[status];
  }

  private toItem(row: ActivityLogRow): ActivityLogItemDto {
    return {
      id: row.actionId,
      status: this.classifyStatus(row.actionStatus),
      rawStatus: row.actionStatus,
      message: this.buildMessage(row),
      actionName: row.actionName ?? this.humanizeActionType(row.actionType),
      customerEmail: row.customerEmail,
      agentName: row.agentName,
      timestamp: row.updatedAt.toISOString(),
    };
  }

  private classifyStatus(rawStatus: string): ActivityLogStatus {
    for (const [bucket, rawStatuses] of Object.entries(STATUS_TO_RAW_STATUSES) as [
      ActivityLogStatus,
      string[],
    ][]) {
      if (rawStatuses.includes(rawStatus)) {
        return bucket;
      }
    }
    // Unknown statuses are shown as pending so the UI never loses an
    // entry; the `rawStatus` field is still returned for debugging.
    return ActivityLogStatus.PENDING;
  }

  /**
   * Prefer the action's own `description` field (it is authored by the
   * agent itself and already tuned for human consumption). When it's
   * missing — which should be rare — fall back to the action name.
   */
  private buildMessage(row: ActivityLogRow): string {
    if (row.description && row.description.trim().length > 0) {
      return row.description;
    }
    if (row.actionName && row.actionName.trim().length > 0) {
      return row.actionName;
    }
    return this.humanizeActionType(row.actionType);
  }

  private humanizeActionType(actionType: string): string {
    return actionType
      .replace(/^oc_/, '')
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
}
