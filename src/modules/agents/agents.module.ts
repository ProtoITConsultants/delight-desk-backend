import { Module } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';
import { DatabaseModule } from 'src/database/database.module';
import { WooCommerceService } from '../woocommerce/woocommerce.service';
import { AgentsRepository } from 'src/database/repos/agents.repository';
import { UserAgentsRepository } from 'src/database/repos/user-agents.repository';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { WooCommerceRestApiService } from '../woocommerce/woocommerce-rest-api.service';
import { UserStoreConnectionsRepository } from 'src/database/repos/user-store-connections.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    AgentsRepository,
    WooCommerceService,
    UserAgentsRepository,
    SystemSettingsRepository,
    WooCommerceRestApiService,
    UserStoreConnectionsRepository,
  ],
  exports: [AgentsService],
})
export class AgentsModule {}
