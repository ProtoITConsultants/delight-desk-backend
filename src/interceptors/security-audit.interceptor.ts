import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { performance } from 'perf_hooks';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Structured audit logs for authenticated requests (no bodies or query strings).
 *
 * On the error path, statusCode is derived from the thrown exception rather than from
 * res.statusCode — the exception filter has not written the response yet at this point,
 * so res.statusCode would still be the default 200 and would lie in the audit log.
 *
 * Duration uses performance.now() so synchronous handlers don't all log durationMs: 0
 * just because start and end fall in the same millisecond.
 */
@Injectable()
export class SecurityAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SecurityAuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startedAt = performance.now();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const userId = req?.session?.userId || null;
    const method = req?.method || 'UNKNOWN';
    const path = String(req?.originalUrl || req?.url || '').split('?')[0];
    const ip = req?.ip || req?.socket?.remoteAddress || 'unknown';

    const elapsedMs = () => Math.round((performance.now() - startedAt) * 100) / 100;

    return next.handle().pipe(
      tap({
        next: () => {
          // No bodies or query strings — only routing and identity metadata.
          if (userId) {
            this.logger.log({
              event: 'authenticated_request',
              userId,
              method,
              path,
              statusCode: res?.statusCode ?? 200,
              durationMs: elapsedMs(),
              ip,
            });
          }
        },
        error: (err: unknown) => {
          if (!userId) return;
          const statusCode = err instanceof HttpException ? err.getStatus() : 500;
          const errorName =
            err instanceof Error && err.name ? err.name : (err as { name?: string })?.name;
          this.logger.warn({
            event: 'authenticated_request_failed',
            userId,
            method,
            path,
            statusCode,
            durationMs: elapsedMs(),
            ip,
            errorName,
          });
        },
      }),
    );
  }
}
