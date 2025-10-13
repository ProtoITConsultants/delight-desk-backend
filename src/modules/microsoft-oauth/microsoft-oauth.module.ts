import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MicrosoftOauthController } from './microsoft-oauth.controller';
import { MicrosoftOauthService } from './microsoft-oauth.service';
import { MicrosoftOauthRepository } from './microsoft-oauth.repository';
import { MicrosoftStrategy } from './microsoft.strategy';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [PassportModule.register({ session: true }), DatabaseModule],
  controllers: [MicrosoftOauthController],
  providers: [MicrosoftOauthService, MicrosoftOauthRepository, MicrosoftStrategy],
  exports: [MicrosoftOauthService],
})
export class MicrosoftOauthModule {}
