import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ShipBobService } from './shipbob.service';

@Module({
  imports: [ConfigModule],
  providers: [ShipBobService],
  exports: [ShipBobService],
})
export class ShipBobModule {}
