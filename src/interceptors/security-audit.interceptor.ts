import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Structured audit logs for authenticated requests (no bodies or query strings).
 */
@Injectable()
export class SecurityAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SecurityAuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const userId = req?.session?.userId || null;
    const method = req?.method || 'UNKNOWN';
    const path = String(req?.originalUrl || req?.url || '').split('?')[0];
    const ip = req?.ip || req?.socket?.remoteAddress || 'unknown';

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
              statusCode: res?.statusCode,
              durationMs: Date.now() - startedAt,
              ip,
            });
          }
        },
        error: () => {
          if (userId) {
            this.logger.warn({
              event: 'authenticated_request_failed',
              userId,
              method,
              path,
              statusCode: res?.statusCode,
              durationMs: Date.now() - startedAt,
              ip,
            });
          }
        },
      }),
    );
  }
}
