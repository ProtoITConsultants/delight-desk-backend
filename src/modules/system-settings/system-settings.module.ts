import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService, SystemSettingsRepository],
})
export class SystemSettingsModule {}
