/**
 * Temporal activity inbound interceptor that reports activity failures to Sentry.
 *
 * Why this exists:
 * - The Sentry NestJS SDK only auto-captures errors flowing through Nest's HTTP / RPC pipelines.
 * - Temporal activities are invoked by the Temporal SDK's worker runtime, not by Nest, so
 *   exceptions thrown there never reach SentryGlobalFilter.
 * - Without this hook, retried activity failures and final permanent failures would be invisible
 *   to Sentry — which is most of where this app actually does work.
 *
 * Behavior:
 * - On every activity execution, run the activity. If it throws, report to Sentry with rich
 *   context (workflowType, activityType, attempt, workflowId, runId) and rethrow so Temporal's
 *   normal retry / failure semantics are preserved.
 * - We do NOT capture cancellations or "already-known" non-retryable expected errors.
 * - Activity input args are intentionally NOT attached — they often contain emails / PII.
 */

import * as Sentry from '@sentry/nestjs';
import { CancelledFailure } from '@temporalio/common';
import { Context as ActivityContext } from '@temporalio/activity';
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  ActivityInterceptors,
  ActivityInterceptorsFactory,
  Next,
} from '@temporalio/worker';

const isCancellation = (err: unknown): boolean => {
  if (err instanceof CancelledFailure) return true;
  const name = (err as { name?: string } | null)?.name;
  return name === 'CancelledFailure' || name === 'AbortError';
};

export const sentryActivityInterceptor: ActivityInterceptorsFactory = (
  ctx: ActivityContext,
): ActivityInterceptors => {
  return {
    inbound: {
      async execute(
        input: ActivityExecuteInput,
        next: Next<ActivityInboundCallsInterceptor, 'execute'>,
      ): Promise<unknown> {
        try {
          return await next(input);
        } catch (err) {
          if (isCancellation(err)) {
            throw err;
          }

          const info = ctx.info;
          // Wrap in a Sentry scope so tags only apply to this event, not future ones on this worker.
          Sentry.withScope((scope) => {
            scope.setTag('source', 'temporal-activity');
            scope.setTag('activityType', info.activityType);
            scope.setTag('workflowType', info.workflowType);
            scope.setTag('taskQueue', info.taskQueue);
            scope.setTag('attempt', String(info.attempt));
            scope.setContext('temporal', {
              activityId: info.activityId,
              activityType: info.activityType,
              workflowId: info.workflowExecution?.workflowId,
              runId: info.workflowExecution?.runId,
              workflowType: info.workflowType,
              attempt: info.attempt,
              taskQueue: info.taskQueue,
              namespace: info.workflowNamespace,
              scheduledTimestampMs: info.scheduledTimestampMs,
            });
            // Group all retries of the same activity under one issue.
            scope.setFingerprint([
              'temporal-activity',
              info.workflowType,
              info.activityType,
              (err as Error)?.message ?? 'unknown',
            ]);
            Sentry.captureException(err);
          });

          throw err;
        }
      },
    },
  };
};
