import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, Subject, Subscription, interval, map } from 'rxjs';

export type ApprovalQueueStreamEvent =
  | {
      type: 'connected';
      timestamp: string;
      reconnectInMs: number;
    }
  | {
      type: 'queue_updated';
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

@Injectable()
export class ApprovalQueueEventsService {
  private static readonly HEARTBEAT_INTERVAL_MS = 25000;
  private static readonly RECONNECT_RETRY_MS = 2000;
  private static readonly MAX_CONNECTIONS_PER_USER = 5;

  private readonly logger = new Logger(ApprovalQueueEventsService.name);
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

      if (streamState.subscriberCount >= ApprovalQueueEventsService.MAX_CONNECTIONS_PER_USER) {
        this.logger.warn(
          `User ${userId} exceeded max SSE connections (${ApprovalQueueEventsService.MAX_CONNECTIONS_PER_USER})`,
        );
        subscriber.error(new Error('Too many concurrent SSE connections'));
        return;
      }

      streamState.subscriberCount += 1;

      const connectedEvent: MessageEvent = {
        type: 'connected',
        retry: ApprovalQueueEventsService.RECONNECT_RETRY_MS,
        data: {
          type: 'connected',
          timestamp: new Date().toISOString(),
          reconnectInMs: ApprovalQueueEventsService.RECONNECT_RETRY_MS,
        } satisfies ApprovalQueueStreamEvent,
      };

      subscriber.next(connectedEvent);

      const innerSub = streamState.subject.asObservable().subscribe(subscriber);

      return () => {
        innerSub.unsubscribe();
        this.removeSubscriber(userId);
      };
    });
  }

  emitQueueUpdated(userId: string, reason: string): void {
    const streamState = this.streams.get(userId);
    if (!streamState || streamState.subscriberCount === 0) {
      return;
    }

    streamState.subject.next({
      type: 'queue_updated',
      data: {
        type: 'queue_updated',
        reason,
        timestamp: new Date().toISOString(),
      } satisfies ApprovalQueueStreamEvent,
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

    const heartbeatSubscription = interval(ApprovalQueueEventsService.HEARTBEAT_INTERVAL_MS)
      .pipe(
        map(
          () =>
            ({
              type: 'heartbeat',
              data: {
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
              } satisfies ApprovalQueueStreamEvent,
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
