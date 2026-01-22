import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApprovalQueueService } from './approval-queue.service';
import {
  ApproveItemDto,
  EditAndApproveDto,
  GetApprovalQueueDto,
  RejectItemDto,
} from './approval-queue.dto';
import { SessionGuard } from '../../guards/session.guard';
import { CurrentUserId } from '../../decorators/current-user.decorator';

@Controller('approval-queue')
@UseGuards(SessionGuard)
export class ApprovalQueueController {
  constructor(private readonly approvalQueueService: ApprovalQueueService) {}

  @Get()
  async getApprovalQueue(@CurrentUserId() userId: string, @Query() dto: GetApprovalQueueDto) {
    return this.approvalQueueService.getApprovalQueue(userId, dto);
  }

  @Get('stats')
  async getStats(@CurrentUserId() userId: string) {
    return this.approvalQueueService.getStats(userId);
  }

  @Get(':id')
  async getApprovalQueueById(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.approvalQueueService.getApprovalQueueById(userId, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approveItem(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: ApproveItemDto,
  ) {
    return this.approvalQueueService.approveItem(userId, id, userId, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectItem(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: RejectItemDto,
  ) {
    return this.approvalQueueService.rejectItem(userId, id, userId, dto);
  }

  @Post(':id/edit-and-approve')
  @HttpCode(HttpStatus.OK)
  async editAndApprove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: EditAndApproveDto,
  ) {
    return this.approvalQueueService.editAndApprove(userId, id, userId, dto);
  }
}
