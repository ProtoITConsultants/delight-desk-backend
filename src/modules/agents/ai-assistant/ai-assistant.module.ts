import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AiAssistantService } from './ai-assistant.service';
import { OpenAIModule } from '../../openai/openai.module';
import { RepositoriesModule } from '../../../database/repositories.module';

@Module({
  imports: [DatabaseModule, OpenAIModule, RepositoriesModule],
  controllers: [],
  providers: [AiAssistantService],
  exports: [AiAssistantService],
})
export class AiAssistantModule {}
