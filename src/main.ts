import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  const PgSession = pgSession(session);

  app.use(
    session({
      store: new PgSession({
        pool: new Pool({
          connectionString: configService.get<string>('DATABASE_URL'),
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
  console.log(`App running on http://localhost:${port}`);
}
bootstrap();
