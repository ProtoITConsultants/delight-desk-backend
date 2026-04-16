import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, Subscription, interval, map } from 'rxjs';

/**
 * Shape of messages emitted on the activity log SSE stream.
 *
 * - `connected`       : sent once when the stream opens, primes the client
 *                       with a retry delay.
 * - `activity_updated`: sent whenever something in this user's activity
 *                       log changed (a new AI action, a status transition,
 *                       a human approval/rejection, ...). The client is
 *                       expected to refetch `/dashboard/activity-log` when
 *                       it sees this event.
 * - `heartbeat`       : periodic keepalive so intermediaries don't kill
 *                       the connection when it would otherwise be idle.
 */
export type ActivityLogStreamEvent =
  | {
      type: 'connected';
      timestamp: string;
      reconnectInMs: number;
    }
  | {
      type: 'activity_updated';
      reason: string;
      timestamp: string;
    }
  | {
      type: 'heartbeat';
      timestamp: string;
    };

interface UserStreamState {
  subject: Subject<MessageEvent>;
  heartbeatSubscription: Subscription;
  subscriberCount: number;
}

/**
 * Maintains one logical SSE stream per user for the activity log card on
 * the dashboard. This mirrors `ApprovalQueueEventsService` on purpose:
 * the approval queue stream is already battle-tested in this codebase,
 * so we keep the same shape (heartbeats, connection cap, fan-out via a
 * `Subject`) to minimise surprises and keep observability consistent.
 */
@Injectable()
export class ActivityLogEventsService {
  private static readonly HEARTBEAT_INTERVAL_MS = 25000;
  private static readonly RECONNECT_RETRY_MS = 2000;
  private static readonly MAX_CONNECTIONS_PER_USER = 5;

  private readonly logger = new Logger(ActivityLogEventsService.name);
  private readonly streams = new Map<string, UserStreamState>();

  getStreamStats() {
    return {
      activeUsers: this.streams.size,
      totalSubscribers: [...this.streams.values()].reduce((sum, s) => sum + s.subscriberCount, 0),
    };
  }

  hasActiveSubscribers(userId: string): boolean {
    const state = this.streams.get(userId);
    return !!state && state.subscriberCount > 0;
  }

  hasAnyActiveSubscribers(): boolean {
    for (const state of this.streams.values()) {
      if (state.subscriberCount > 0) {
        return true;
      }
    }
    return false;
  }

  subscribe(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const streamState = this.getOrCreateUserStream(userId);

      if (streamState.subscriberCount >= ActivityLogEventsService.MAX_CONNECTIONS_PER_USER) {
        this.logger.warn(
          `User ${userId} exceeded max activity-log SSE connections (${ActivityLogEventsService.MAX_CONNECTIONS_PER_USER})`,
        );
        subscriber.error(new Error('Too many concurrent SSE connections'));
        return;
      }

      streamState.subscriberCount += 1;

      const connectedEvent: MessageEvent = {
        type: 'connected',
        retry: ActivityLogEventsService.RECONNECT_RETRY_MS,
        data: {
          type: 'connected',
          timestamp: new Date().toISOString(),
          reconnectInMs: ActivityLogEventsService.RECONNECT_RETRY_MS,
        } satisfies ActivityLogStreamEvent,
      };

      subscriber.next(connectedEvent);

      const innerSub = streamState.subject.asObservable().subscribe(subscriber);

      return () => {
        innerSub.unsubscribe();
        this.removeSubscriber(userId);
      };
    });
  }

  /**
   * Publish an `activity_updated` event to all active subscribers for a
   * given user. Safe to call from anywhere — we no-op when the user has
   * no active subscribers, so emission never blocks critical paths.
   */
  emitActivityUpdated(userId: string, reason: string): void {
    const streamState = this.streams.get(userId);
    if (!streamState || streamState.subscriberCount === 0) {
      return;
    }

    streamState.subject.next({
      type: 'activity_updated',
      data: {
        type: 'activity_updated',
        reason,
        timestamp: new Date().toISOString(),
      } satisfies ActivityLogStreamEvent,
    });
  }

  private getOrCreateUserStream(userId: string): UserStreamState {
    const existing = this.streams.get(userId);
    if (existing && !existing.subject.closed) {
      return existing;
    }

    if (existing) {
      existing.heartbeatSubscription.unsubscribe();
      this.streams.delete(userId);
    }

    const subject = new Subject<MessageEvent>();

    const heartbeatSubscription = interval(ActivityLogEventsService.HEARTBEAT_INTERVAL_MS)
      .pipe(
        map(
          () =>
            ({
              type: 'heartbeat',
              data: {
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
              } satisfies ActivityLogStreamEvent,
            }) satisfies MessageEvent,
        ),
      )
      .subscribe((event) => subject.next(event));

    const state: UserStreamState = {
      subject,
      heartbeatSubscription,
      subscriberCount: 0,
    };

    this.streams.set(userId, state);
    return state;
  }

  private removeSubscriber(userId: string): void {
    const streamState = this.streams.get(userId);
    if (!streamState) {
      return;
    }

    streamState.subscriberCount = Math.max(streamState.subscriberCount - 1, 0);

    if (streamState.subscriberCount === 0) {
      streamState.heartbeatSubscription.unsubscribe();
      streamState.subject.complete();
      this.streams.delete(userId);
    }
  }
}
