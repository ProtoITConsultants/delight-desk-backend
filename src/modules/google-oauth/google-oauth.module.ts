import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { GoogleOauthController } from './google-oauth.controller';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthRepository } from './google-oauth.repository';
import { GoogleStrategy } from './google.strategy';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [PassportModule.register({ session: true }), DatabaseModule],
  controllers: [GoogleOauthController],
  providers: [GoogleOauthService, GoogleOauthRepository, GoogleStrategy],
  exports: [GoogleOauthService],
})
export class GoogleOauthModule {}
