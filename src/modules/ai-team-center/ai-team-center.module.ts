import { Module } from '@nestjs/common';
import { AiIdentityController } from './ai-identity.controller';
import { AiIdentityService } from './ai-identity.service';
import { AiIdentityRepository } from '../../database/repos/ai-identity.repository';
import { OpenAIModule } from '../openai/openai.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule, OpenAIModule],
  controllers: [AiIdentityController],
  providers: [AiIdentityService, AiIdentityRepository],
  exports: [AiIdentityService, AiIdentityRepository],
})
export class AiTeamCenterModule {}
