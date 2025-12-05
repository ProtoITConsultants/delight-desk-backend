import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './google.strategy';
import { GoogleOauthService } from './google-oauth.service';
import { DatabaseModule } from 'src/database/database.module';
import { GoogleOauthController } from './google-oauth.controller';
import { GoogleOauthRepository } from './google-oauth.repository';

@Module({
  imports: [PassportModule.register({ session: true }), DatabaseModule],
  controllers: [GoogleOauthController],
  providers: [GoogleOauthService, GoogleOauthRepository, GoogleStrategy],
  exports: [GoogleOauthService],
})
export class GoogleOauthModule {}
