import { forwardRef, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './google.strategy';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthController } from './google-oauth.controller';
import { GoogleOauthRepository } from '../../database/repos/google-oauth.repository';
import { EmailPipelineModule } from '../email-pipeline/email-pipeline.module';
import { InfraModule } from '../email-pipeline/temporal/infra.module';

@Module({
  imports: [
    PassportModule.register({ session: true }),
    InfraModule,
    forwardRef(() => EmailPipelineModule),
  ],
  controllers: [GoogleOauthController],
  providers: [GoogleOauthService, GoogleOauthRepository, GoogleStrategy],
  exports: [GoogleOauthService],
})
export class GoogleOauthModule {}
