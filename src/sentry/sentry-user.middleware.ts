/**
 * Per-request middleware that tags the current Sentry scope with the logged-in merchant.
 *
 * Reads `req.session.userId` (set at login/signup) and calls `Sentry.setUser({ id })` so any
 * error captured during this request is attributed to a specific user. The Sentry NestJS SDK
 * uses async-context isolation per request, so this attribution does not leak across requests.
 *
 * We intentionally send only the user ID — no email, no username — to keep PII out of Sentry.
 * To resolve a user, look up the ID in the database.
 *
 * IMPORTANT: This middleware ONLY tags the merchant who owns the session. It must NEVER
 * be used to tag end-customer email addresses (those are payload data, not user identity).
 */

import * as Sentry from '@sentry/nestjs';
import type { NextFunction, Request, Response } from 'express';

export function createSentryUserMiddleware() {
  return function sentryUserMiddleware(req: Request, _res: Response, next: NextFunction): void {
    const session = req.session as (Request['session'] & { userId?: string }) | undefined;
    const userId = session?.userId;

    if (userId) {
      Sentry.setUser({ id: userId });
    }

    next();
  };
}
