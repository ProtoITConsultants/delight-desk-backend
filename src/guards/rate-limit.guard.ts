import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiRateLimitRepository } from '../database/repos/api-rate-limit.repository';
import { RATE_LIMIT_KEY, RateLimitConfig } from '../decorators/rate-limit.decorator';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rateLimitRepository: ApiRateLimitRepository,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const num = 5 + 5;

    console.log('Rate Limit Guard');
    const rateLimitConfig = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );


    if (!rateLimitConfig) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.userId;

    if (!userId) {
      // If no userId, skip rate limiting (shouldn't happen with SessionGuard)
      return true;
    }

    const { endpoint, limit, windowMs } = rateLimitConfig;

    // Use windowMs from decorator if provided, otherwise use env variable, default to 1 week
    const defaultWindowMs = parseInt(
      this.configService.get('RATE_LIMIT_WINDOW_MS') || '604800000',
      10,
    );
    const effectiveWindowMs = windowMs ?? defaultWindowMs;

    const result = await this.rateLimitRepository.checkAndGetLimit(
      userId,
      endpoint,
      limit,
      effectiveWindowMs,
    );

    console.log({ result });

    // Add rate limit headers to response
    const response = context.switchToHttp().getResponse();
    response.header('X-RateLimit-Limit', result.limit.toString());
    response.header('X-RateLimit-Remaining', result.remaining.toString());
    response.header('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000).toString());

    if (!result.allowed) {
      // Format the time window for display
      const timeWindow = this.formatTimeWindow(effectiveWindowMs);

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Rate limit exceeded. You can make ${result.limit} requests per ${timeWindow}.`,
          error: 'Too Many Requests',
          retryAfter: result.retryAfter?.toISOString(),
          usage: {
            limit: result.limit,
            remaining: result.remaining,
            resetAt: result.resetAt.toISOString(),
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private formatTimeWindow(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (weeks > 0) {
      return weeks === 1 ? '1 week' : `${weeks} weeks`;
    }
    if (days > 0) {
      return days === 1 ? '1 day' : `${days} days`;
    }
    if (hours > 0) {
      return hours === 1 ? '1 hour' : `${hours} hours`;
    }
    if (minutes > 0) {
      return minutes === 1 ? '1 minute' : `${minutes} minutes`;
    }
    return seconds === 1 ? '1 second' : `${seconds} seconds`;
  }
}
