import { Module } from '@nestjs/common';
import { StoreConnectionsService } from './store-connections.service';
import { StoreConnectionsController } from './store-connections.controller';
import { StoreConnectionsRepository } from './store-connections.repository';
import { DatabaseModule } from 'src/database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [StoreConnectionsService, StoreConnectionsRepository],
  controllers: [StoreConnectionsController],
  exports: [StoreConnectionsService,StoreConnectionsRepository],
})
export class StoreConnectionsModule {}
