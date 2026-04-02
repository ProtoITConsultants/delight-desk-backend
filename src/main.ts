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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SecurityAuditInterceptor } from './interceptors/security-audit.interceptor';
import { AuthenticatedResponseSecurityInterceptor } from './interceptors/authenticated-response-security.interceptor';

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const port = Number(configService.get<string>('PORT')) || 3000;

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
        maxAge: Number(configService.get<string>('SESSION_MAX_AGE')) || 24 * 60 * 60 * 1000,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true, // reject unexpected JSON properties on DTOs
      transform: true,
      forbidUnknownValues: true,
    }),
  );

  app.use((req, res, next) => {
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
  morgan.token('clean-url', (req) => (((req as any).originalUrl || req.url || '') as string).split('?')[0]);
  app.use(
    morgan(isProd ? ':remote-addr - :method :clean-url :status :response-time ms' : 'dev'),
  );

  app.useGlobalInterceptors(
    new AuthenticatedResponseSecurityInterceptor(), // no-store for session-backed responses
    new SecurityAuditInterceptor(), // structured audit log for authenticated requests
  );

  const config = new DocumentBuilder()
    .setTitle('DelightDesk API')
    .setDescription(
      'B2B SaaS API for AI-powered email automation and customer support. ' +
        'Integrates with Gmail, Outlook, WooCommerce, and AI (OpenAI GPT-4o) for automated email responses. ' +
        '\n\n**Authentication**: This API uses session-based authentication with HTTP-only cookies. ' +
        'To test authenticated endpoints via Swagger UI, first login via the /auth/login endpoint, ' +
        'then the session cookie will be automatically included in subsequent requests.',
    )
    .setVersion('1.0.0')
    .addCookieAuth('connect.sid', {
      type: 'apiKey',
      in: 'cookie',
      name: 'connect.sid',
      description: 'Session cookie (automatically set after login)',
    })
    .addTag('Authentication', 'User signup, login, logout, and password reset')
    .addTag('Users', 'User management and profile operations')
    .addTag('Accounts', 'Account profile and settings management')
    .addTag('Agents', 'AI agent configuration and system settings')
    .addTag(
      'AI Assistant',
      'Escalation management, email signatures, and AI-powered response generation',
    )
    .addTag(
      'AI Team Center - Identity',
      'Configure AI agent identity, personality, and email signature for consistent customer communication',
    )
    .addTag(
      'AI Team Center - Product Knowledge',
      'Manage product knowledge sources and retrieval context for AI agents',
    )
    .addTag('Approval Queue', 'Human-in-the-loop approval workflow for AI actions')
    .addTag('Google OAuth', 'Gmail OAuth integration')
    .addTag('Microsoft OAuth', 'Outlook OAuth integration')
    .addTag('WooCommerce', 'E-commerce store integration')
    .addTag('Contact', 'Contact form submissions')
    .addTag('System Settings', 'Fulfillment method and system configuration')
    .addTag('Billing', 'Plans and subscription management')
    .build();

  // Hide API docs in production unless explicitly enabled (reduces attack surface).
  const enableSwagger =
    !isProd || configService.get<string>('ENABLE_SWAGGER_IN_PRODUCTION') === 'true';

  if (enableSwagger) {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      customSiteTitle: 'DelightDesk API Documentation',
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  const baseUrl = `http://localhost:${port}`;
  console.log(`🚀 Application is running on: ${baseUrl}`);
  if (enableSwagger) {
    console.log(`📚 Swagger UI available at: ${baseUrl}/api-docs`);
    console.log(`📄 OpenAPI JSON available at: ${baseUrl}/api-docs-json`);
  }

  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap().catch((err) => {
  console.error('❌ Failed to start application:', err);
  process.exit(1);
});
