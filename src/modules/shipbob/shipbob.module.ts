import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from 'src/database/database.module';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { ShipBobService } from './shipbob.service';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [ShipBobService, SystemSettingsRepository],
  exports: [ShipBobService],
})
export class ShipBobModule {}
