import { Module } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { DatabaseModule } from 'src/database/database.module';
import { GoogleOauthRepository } from '../google-oauth/google-oauth.repository';
import { MicrosoftOauthRepository } from '../microsoft-oauth/microsoft-oauth.repository';
import { StoreConnectionsRepository } from '../store-connections/store-connections.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService, StoreConnectionsRepository, GoogleOauthRepository, MicrosoftOauthRepository],
})
export class ConnectionsModule {}
