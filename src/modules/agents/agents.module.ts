import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { DatabaseModule } from 'src/database/database.module';
import { AgentsRepository } from 'src/database/repos/agents.repository';
import { UserAgentsRepository } from 'src/database/repos/user-agents.repository';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentsRepository, UserAgentsRepository, SystemSettingsRepository],
  exports: [AgentsService],
})
export class AgentsModule {}
