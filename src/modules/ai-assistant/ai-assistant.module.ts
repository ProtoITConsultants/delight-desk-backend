import { forwardRef, Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AiAssistantService } from './ai-assistant.service';
import { AiAssistantController } from './ai-assistant.controller';
import { OpenAIModule } from '../openai/openai.module';
import { RepositoriesModule } from '../../database/repositories.module';
import { GoogleOauthModule } from '../google-oauth/google-oauth.module';

@Module({
  imports: [DatabaseModule, OpenAIModule, RepositoriesModule, forwardRef(() => GoogleOauthModule)],
  controllers: [AiAssistantController],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
