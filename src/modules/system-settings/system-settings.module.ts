import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { ShipBobModule } from '../shipbob/shipbob.module';
import { ShipStationModule } from '../shipstation/shipstation.module';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';

@Module({
  imports: [DatabaseModule, ConfigModule, ShipStationModule, ShipBobModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService, SystemSettingsRepository],
})
export class SystemSettingsModule {}
