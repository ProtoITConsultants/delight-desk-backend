/**
 * Sentry instrumentation.
 *
 * MUST be imported as the very first thing in src/main.ts (before AppModule and any other
 * application code) so that Sentry's auto-instrumentation can wrap the relevant modules at
 * import time. See https://docs.sentry.io/platforms/javascript/guides/nestjs/.
 *
 * Sentry is enabled when:
 *   - SENTRY_DSN is set, AND
 *   - NODE_ENV === 'production'  OR  SENTRY_ENABLE_LOCAL === 'true'
 *
 * In dev, leave SENTRY_ENABLE_LOCAL unset to avoid polluting the project with local errors.
 * Set SENTRY_ENABLE_LOCAL=true temporarily when you want to verify the integration end-to-end
 * from your machine.
 */

import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'password',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'code',
  'client_secret',
  'session',
]);

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
]);

/** Strip sensitive fields from request data before it leaves the process. */
function scrubRequest(request: Record<string, unknown> | undefined) {
  if (!request) return;

  // Always drop bodies — they routinely contain customer email content, PII, and credentials.
  if ('data' in request) delete (request as Record<string, unknown>).data;
  if ('cookies' in request) delete (request as Record<string, unknown>).cookies;

  const headers = (request as Record<string, unknown>).headers;
  if (headers && typeof headers === 'object') {
    for (const key of Object.keys(headers as Record<string, unknown>)) {
      if (SENSITIVE_HEADER_KEYS.has(key.toLowerCase())) {
        (headers as Record<string, unknown>)[key] = '[Filtered]';
      }
    }
  }

  const queryString = (request as Record<string, unknown>).query_string;
  if (queryString && typeof queryString === 'string') {
    (request as Record<string, unknown>).query_string = scrubQueryString(queryString);
  } else if (queryString && typeof queryString === 'object') {
    for (const key of Object.keys(queryString as Record<string, unknown>)) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        (queryString as Record<string, unknown>)[key] = '[Filtered]';
      }
    }
  }

  const url = (request as Record<string, unknown>).url;
  if (typeof url === 'string' && url.includes('?')) {
    const [base, qs] = url.split('?');
    (request as Record<string, unknown>).url = `${base}?${scrubQueryString(qs)}`;
  }
}

function scrubQueryString(qs: string): string {
  return qs
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const key = pair.slice(0, eq);
      return SENSITIVE_QUERY_KEYS.has(key.toLowerCase()) ? `${key}=[Filtered]` : pair;
    })
    .join('&');
}

const dsn = process.env.SENTRY_DSN;
const isProd = process.env.NODE_ENV === 'production';
const enableLocal = process.env.SENTRY_ENABLE_LOCAL === 'true';
const shouldEnable = Boolean(dsn) && (isProd || enableLocal);

if (shouldEnable) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || (isProd ? 'production' : 'development'),
    release: process.env.SENTRY_RELEASE,

    // We are not using performance tracing yet — keep at 0 to control cost and overhead.
    // Flip this on (e.g. 0.05) once the error pipeline is stable.
    tracesSampleRate: 0,
    profilesSampleRate: 0,

    // Do not let the SDK auto-attach IP addresses, cookies, request bodies, or user data.
    // We add only what we explicitly choose in beforeSend.
    sendDefaultPii: false,

    // Reduce console noise in event breadcrumbs — our logs may include user content.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Console'),

    // Known noisy / expected errors that we don't want paging us.
    ignoreErrors: [
      'WorkflowNotFoundError',
      'WorkflowExecutionAlreadyStartedError',
      // OAuth refresh token expirations are recoverable and frequent.
      'invalid_grant',
    ],

    beforeSend(event) {
      scrubRequest(event.request as Record<string, unknown> | undefined);

      // Drop user identifiers we never want to ship — only event-level fields we explicitly set.
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
        delete event.user.username;
      }

      // Strip any "extra" payloads that contain raw email content or known sensitive fields.
      if (event.extra) {
        for (const key of Object.keys(event.extra)) {
          if (/(email|body|subject|content|token|secret|password)/i.test(key)) {
            event.extra[key] = '[Filtered]';
          }
        }
      }

      return event;
    },

    beforeBreadcrumb(breadcrumb) {
      // HTTP breadcrumbs may carry sensitive query strings — scrub them.
      if (breadcrumb.category === 'http' && breadcrumb.data?.url) {
        const u = String(breadcrumb.data.url);
        if (u.includes('?')) {
          const [base, qs] = u.split('?');
          breadcrumb.data.url = `${base}?${scrubQueryString(qs)}`;
        }
      }
      return breadcrumb;
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `[sentry] initialized (env=${process.env.SENTRY_ENVIRONMENT || (isProd ? 'production' : 'development')})`,
  );
} else if (!dsn) {
  // eslint-disable-next-line no-console
  console.log('[sentry] disabled — SENTRY_DSN not set');
} else {
  // eslint-disable-next-line no-console
  console.log('[sentry] disabled — set SENTRY_ENABLE_LOCAL=true to enable in non-production');
}

export const isSentryEnabled = shouldEnable;
