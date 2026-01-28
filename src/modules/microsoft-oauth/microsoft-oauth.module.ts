import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MicrosoftStrategy } from './microsoft.strategy';
import { DatabaseModule } from 'src/database/database.module';
import { MicrosoftOauthService } from './microsoft-oauth.service';
import { MicrosoftOauthController } from './microsoft-oauth.controller';
import { MicrosoftOauthRepository } from '../../database/repos/microsoft-oauth.repository';

@Module({
  imports: [PassportModule.register({ session: true }), DatabaseModule],
  controllers: [MicrosoftOauthController],
  providers: [MicrosoftOauthService, MicrosoftOauthRepository, MicrosoftStrategy],
  exports: [MicrosoftOauthService],
})
export class MicrosoftOauthModule {}
