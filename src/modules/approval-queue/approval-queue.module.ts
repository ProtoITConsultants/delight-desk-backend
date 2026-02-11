import { Module } from '@nestjs/common';
import { ApprovalQueueController } from './approval-queue.controller';
import { ApprovalQueueService } from './approval-queue.service';
import { RepositoriesModule } from '../../database/repositories.module';
import { InfraModule } from '../temporal/infra.module';

@Module({
  imports: [RepositoriesModule, InfraModule],
  controllers: [ApprovalQueueController],
  providers: [ApprovalQueueService],
  exports: [ApprovalQueueService],
})
export class ApprovalQueueModule {}
