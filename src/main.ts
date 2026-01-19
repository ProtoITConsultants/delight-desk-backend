import { Pool } from 'pg';
import morgan from 'morgan';
import session from 'express-session';
import { AppModule } from './app.module';
import pgSession from 'connect-pg-simple';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

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

  app.enableShutdownHooks();

  await app.listen(port);
}

void bootstrap();
