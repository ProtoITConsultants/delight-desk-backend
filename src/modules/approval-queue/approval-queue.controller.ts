import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';

import { Observable } from 'rxjs';
import { ApprovalQueueService } from './approval-queue.service';
import {
  CancelWorkflowDto,
  EditAndApproveDto,
  GetApprovalQueueDto,
  GetWorkflowProgressItemsDto,
  RejectItemDto,
} from './approval-queue.dto';
import { SessionGuard } from '../../guards/session.guard';
import { CurrentUserId } from '../../decorators/current-user.decorator';

@Controller('approval-queue')
@UseGuards(SessionGuard)
export class ApprovalQueueController {
  constructor(private readonly approvalQueueService: ApprovalQueueService) {}

  @Get()
  async getApprovalQueueItems(@CurrentUserId() userId: string, @Query() dto: GetApprovalQueueDto) {
    return this.approvalQueueService.getApprovalQueueItems(userId, dto);
  }

  @Get('workflows')
  async getWorkflowProgressItems(
    @CurrentUserId() userId: string,
    @Query() dto: GetWorkflowProgressItemsDto,
  ) {
    return this.approvalQueueService.getWorkflowProgressItems(userId, dto);
  }

  @Get('stats')
  async getStats(@CurrentUserId() userId: string) {
    return this.approvalQueueService.getStats(userId);
  }

  @Sse('stream')
  streamApprovalQueue(@CurrentUserId() userId: string): Observable<MessageEvent> {
    return this.approvalQueueService.streamQueueUpdates(userId);
  }

  @Get('stream/stats')
  getStreamStats() {
    return this.approvalQueueService.getStreamStats();
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancelWorkflow(@CurrentUserId() userId: string, @Body() dto: CancelWorkflowDto) {
    return this.approvalQueueService.cancelWorkflow(userId, dto.workflowId);
  }

  @Post('actions/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveItem(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.approvalQueueService.approveAction(userId, id, userId);
  }

  @Post('actions/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectItem(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: RejectItemDto,
  ) {
    return this.approvalQueueService.rejectAction(userId, id, userId, dto);
  }

  @Post('actions/:id/edit-and-approve')
  @HttpCode(HttpStatus.OK)
  async editAndApprove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: EditAndApproveDto,
  ) {
    return this.approvalQueueService.editAndApprove(userId, id, dto);
  }
}
