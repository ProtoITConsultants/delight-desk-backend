import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);

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

  const PgSession = pgSession(session);

  app.set('trust proxy', 1);

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
      secret: configService.get<string>('SESSION_SECRET', 'super-secret'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: Number(configService.get<string>('SESSION_MAX_AGE')),
        secure: configService.get<string>('NODE_ENV') === 'production',
        sameSite: 'none',
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );

  const port = Number(configService.get<string>('PORT'));

  await app.listen(port);

  // Testing Key Change

  console.log(`App running on http://localhost:${port}`);
}

void bootstrap();
