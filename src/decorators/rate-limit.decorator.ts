import { SetMetadata } from '@nestjs/common';

export interface RateLimitConfig {
  endpoint: string;
  limit: number;
  windowMs?: number; // Optional window duration in milliseconds
}

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (endpoint: string, limit: number = 5, windowMs?: number) =>
  SetMetadata(RATE_LIMIT_KEY, { endpoint, limit, windowMs } as RateLimitConfig);
