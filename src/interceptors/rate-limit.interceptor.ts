import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ApiRateLimitRepository } from '../database/repos/api-rate-limit.repository';
import { RATE_LIMIT_KEY, RateLimitConfig } from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private rateLimitRepository: ApiRateLimitRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const rateLimitConfig = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!rateLimitConfig) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.userId;

    if (!userId) {
      return next.handle();
    }

    const { endpoint, limit, windowMs } = rateLimitConfig;

    // Use windowMs from decorator if provided, otherwise use env variable, default to 1 week
    const defaultWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '604800000', 10);
    const effectiveWindowMs = windowMs ?? defaultWindowMs;

    return next.handle().pipe(
      tap({
        next: () => {
          // Increment count only on successful response (no error thrown)
          this.rateLimitRepository
            .incrementCount(userId, endpoint, limit, effectiveWindowMs)
            .catch((error) => {
              console.error('Failed to increment rate limit count:', error);
            });
        },
        error: () => {
          // Don't increment count on error
        },
      }),
    );
  }
}
