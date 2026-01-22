import { Module } from '@nestjs/common';
import { ApprovalQueueController } from './approval-queue.controller';
import { ApprovalQueueService } from './approval-queue.service';
import { RepositoriesModule } from '../../database/repositories.module';
import { EmailPipelineModule } from '../email-pipeline/email-pipeline.module';

@Module({
  imports: [RepositoriesModule, EmailPipelineModule],
  controllers: [ApprovalQueueController],
  providers: [ApprovalQueueService],
  exports: [ApprovalQueueService],
})
export class ApprovalQueueModule {}
