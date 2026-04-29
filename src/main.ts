// IMPORTANT: ./instrument MUST be the very first import so Sentry can wrap modules at load time.
import './instrument';
import * as Sentry from '@sentry/nestjs';

import { existsSync, statSync } from 'fs';
import { Pool } from 'pg';
import morgan from 'morgan';
import helmet from 'helmet';
import session from 'express-session';
import { AppModule } from './app.module';
import pgSession from 'connect-pg-simple';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SecurityAuditInterceptor } from './interceptors/security-audit.interceptor';
import { AuthenticatedResponseSecurityInterceptor } from './interceptors/authenticated-response-security.interceptor';
import { createSentryUserMiddleware } from './sentry/sentry-user.middleware';

/** Sliding-window limiter by route + IP (in-memory; per-process, not distributed). */
function createPublicRateLimitMiddleware(limit: number, windowMs: number) {
  const bucket = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${req.path}:${ip}`;
    const current = bucket.get(key);

    if (!current || now > current.resetAt) {
      bucket.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= limit) {
      return res.status(429).json({
        statusCode: 429,
        message: `Too many requests. Limit is ${limit} requests per ${Math.floor(windowMs / 60000)} minute(s).`,
        error: 'Too Many Requests',
      });
    }

    current.count += 1;
    bucket.set(key, current);
    return next();
  };
}

/** Reject query params that often carry secrets so they are not logged or leaked via Referer. */
function hasSensitiveQueryKey(query: Request['query']): boolean {
  const sensitiveKeys = new Set([
    'token',
    'access_token',
    'refresh_token',
    'password',
    'secret',
    'api_key',
    'apikey',
    'authorization',
  ]);

  return Object.keys(query || {}).some((key) => sensitiveKeys.has(key.toLowerCase()));
}

async function bootstrap() {
  // rawBody=true exposes `req.rawBody: Buffer` on every request, which the
  // WooCommerce webhooks controller needs to verify the HMAC-SHA256 signature
  // against the exact bytes WooCommerce signed. Other handlers ignore it, so
  // enabling globally has no functional effect outside the webhook receiver.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const port = Number(configService.get<string>('PORT')) || 3000;

  // Block overly permissive .env on disk in production (group/other must not read secrets).
  if (isProd && existsSync('.env')) {
    const mode = statSync('.env').mode & 0o777;
    if ((mode & 0o077) !== 0) {
      throw new Error('.env permissions are too broad in production. Expected 600 or stricter.');
    }
  }

  const origins = configService
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (isProd && origins.length === 0) {
    throw new Error('CORS_ORIGINS must be configured in production');
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Mobile apps and curl send no Origin; browsers must match CORS_ORIGINS.
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // Default security headers; CORP allows cross-origin assets when cookies/credentials are used.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.disable('x-powered-by');

  if (isProd) {
    app.useLogger(['error', 'warn', 'log']);
  }

  app.set('trust proxy', 1);

  const PgSession = pgSession(session);

  app.use(
    session({
      store: new PgSession({
        pool: new Pool({
          connectionString: configService.get<string>('DATABASE_URL'),
          ssl: false,
        }),
        tableName: 'user_sessions',
      }),
      secret: configService.get<string>('SESSION_SECRET') as string,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: Number(configService.get<string>('SESSION_MAX_AGE')),
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
      },
    }),
  );

  // Tag the active Sentry scope with the logged-in user. Must run AFTER session middleware
  // so req.session is populated. Only the user ID is sent — never email or other PII.
  app.use(createSentryUserMiddleware());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // reject unexpected JSON properties on DTOs
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (hasSensitiveQueryKey(req.query)) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Sensitive values must not be sent in query parameters',
        error: 'Bad Request',
      });
    }
    return next();
  });

  // Brute-force and abuse mitigation on unauthenticated auth and contact routes.
  const publicAuthRateLimit = createPublicRateLimitMiddleware(10, 60 * 1000);
  app.use('/auth/login', publicAuthRateLimit);
  app.use('/auth/signup', publicAuthRateLimit);
  app.use('/auth/forgot-password', publicAuthRateLimit);
  app.use('/auth/reset-password', publicAuthRateLimit);
  app.use('/contact', createPublicRateLimitMiddleware(20, 60 * 1000));

  // Omit query string from access logs to reduce accidental capture of sensitive params.
  morgan.token(
    'clean-url',
    (req) => (((req as any).originalUrl || req.url || '') as string).split('?')[0],
  );
  app.use(morgan(isProd ? ':remote-addr - :method :clean-url :status :response-time ms' : 'dev'));

  app.useGlobalInterceptors(
    new AuthenticatedResponseSecurityInterceptor(), // no-store for session-backed responses
    new SecurityAuditInterceptor(), // structured audit log for authenticated requests
  );

  const baseUrl = `http://localhost:${port}`;
  console.log(`🚀 Application is running on: ${baseUrl}`);

  app.enableShutdownHooks();

  await app.listen(port);
}

// Catch background failures that escape Nest/Temporal handlers so they reach Sentry.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  Sentry.captureException(reason, { tags: { source: 'unhandledRejection' } });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  Sentry.captureException(err, { tags: { source: 'uncaughtException' } });
});

void bootstrap().catch(async (err) => {
  console.error('❌ Failed to start application:', err);
  Sentry.captureException(err, { tags: { source: 'bootstrap' } });
  // Best-effort flush so the event isn't lost when the process exits.
  await Sentry.close(2000).catch(() => undefined);
  process.exit(1);
});
