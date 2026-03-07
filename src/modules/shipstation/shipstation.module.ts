import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { ShipStationService } from './shipstation.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [ShipStationService, SystemSettingsRepository],
  exports: [ShipStationService],
})
export class ShipStationModule {}
