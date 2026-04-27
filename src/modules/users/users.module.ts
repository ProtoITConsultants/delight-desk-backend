import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DatabaseModule } from 'src/database/database.module';
import { UserRepository } from '../../database/repos/users.repository';
import { GoogleOauthRepository } from '../../database/repos/google-oauth.repository';
import { MicrosoftOauthRepository } from '../../database/repos/microsoft-oauth.repository';
import { SystemSettingsRepository } from '../../database/repos/system-settings.repository';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserRepository,
    GoogleOauthRepository,
    MicrosoftOauthRepository,
    SystemSettingsRepository,
    UserStoreConnectionsRepository,
  ],
  exports: [UsersService],
})
export class UsersModule {}
