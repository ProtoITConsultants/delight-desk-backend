import { Pool } from 'pg';
import morgan from 'morgan';
import session from 'express-session';
import { AppModule } from './app.module';
import pgSession from 'connect-pg-simple';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const isProd = configService.get<string>('NODE_ENV') === 'production';
  const port = Number(configService.get<string>('PORT'));

  const origins = configService
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  app.set('trust proxy', 1);

  const PgSession = pgSession(session);

  app.use(
    session({
      store: new PgSession({
        pool: new Pool({
          connectionString: configService.get<string>('DATABASE_URL'),
          ssl: {
            rejectUnauthorized: false,
          },
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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  app.use(morgan('dev'));

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
    .addTag('Approval Queue', 'Human-in-the-loop approval workflow for AI actions')
    .addTag('Google OAuth', 'Gmail OAuth integration')
    .addTag('Microsoft OAuth', 'Outlook OAuth integration')
    .addTag('WooCommerce', 'E-commerce store integration')
    .addTag('Contact', 'Contact form submissions')
    .build();

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

  console.log(`📚 Swagger UI available at: {baseUrl}/api-docs`);
  console.log(`📄 OpenAPI JSON available at: {baseUrl}/api-docs-json`);

  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
