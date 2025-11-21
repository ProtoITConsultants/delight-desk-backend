import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRepository } from './users.repository';
import { UsersController } from './users.controller';
import { DatabaseModule } from 'src/database/database.module';
import { GoogleOauthRepository } from '../google-oauth/google-oauth.repository';
import { MicrosoftOauthRepository } from '../microsoft-oauth/microsoft-oauth.repository';
import { UserStoreConnectionsRepository } from '../woocommerce-oauth/user-store-connections.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserRepository,
    GoogleOauthRepository,
    MicrosoftOauthRepository,
    UserStoreConnectionsRepository,
  ],
  exports: [UsersService],
})
export class UsersModule {}
