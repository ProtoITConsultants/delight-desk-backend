import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShipStationService } from './shipstation.service';

@Module({
  imports: [ConfigModule],
  providers: [ShipStationService],
  exports: [ShipStationService],
})
export class ShipStationModule {}
