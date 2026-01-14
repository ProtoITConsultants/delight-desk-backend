import { Module } from '@nestjs/common';
import { AftershipService } from './aftership.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule],
  providers: [AftershipService, ConfigService],
  exports: [AftershipService],
})
export class AftershipModule {}
