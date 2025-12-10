import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { DatabaseModule } from 'src/database/database.module';
import { PlansRepository } from '../../../database/repos/plans.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [PlansController],
  providers: [PlansService, PlansRepository],
})
export class PlansModule {}
