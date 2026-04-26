/**
 * Smoke-test endpoint to verify Sentry capture is wired up end-to-end.
 *
 * Disabled by default. Enable by setting SENTRY_DEBUG_ENDPOINT=true and hitting
 * GET /debug/sentry/error — the request will throw, the global Sentry filter will report it,
 * and you should see a new issue appear in your Sentry project within a few seconds.
 *
 * Remove or keep disabled in production — there is no auth on this route by design (it should
 * only be enabled briefly during initial verification).
 */

import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('debug/sentry')
export class SentryDebugController {
  constructor(private readonly config: ConfigService) {}

  @Get('error')
  triggerError(): never {
    if (this.config.get<string>('SENTRY_DEBUG_ENDPOINT') !== 'true') {
      throw new NotFoundException();
    }
    throw new Error(
      `Sentry smoke test from ${this.config.get<string>('SENTRY_ENVIRONMENT') || 'unknown'} ` +
        `at ${new Date().toISOString()}`,
    );
  }
}
