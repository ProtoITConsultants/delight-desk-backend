import { Module } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { ConnectionsController } from './connections.controller';
import { DatabaseModule } from 'src/database/database.module';
import { GoogleOauthRepository } from '../google-oauth/google-oauth.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService, GoogleOauthRepository],
})
export class ConnectionsModule {}
