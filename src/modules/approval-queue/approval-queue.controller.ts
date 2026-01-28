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
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApprovalQueueService } from './approval-queue.service';
import { EditAndApproveDto, GetApprovalQueueDto, RejectItemDto } from './approval-queue.dto';
import { SessionGuard } from '../../guards/session.guard';
import { CurrentUserId } from '../../decorators/current-user.decorator';

@ApiTags('Approval Queue')
@ApiCookieAuth('connect.sid')
@Controller('approval-queue')
@UseGuards(SessionGuard)
export class ApprovalQueueController {
  constructor(private readonly approvalQueueService: ApprovalQueueService) {}

  @Get()
  @ApiOperation({
    summary: 'Get approval queue items',
    description:
      'Retrieve paginated list of items in the approval queue with filtering options by status, agent type, and priority',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'rejected', 'edited', 'executed'],
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'agentType',
    required: false,
    type: String,
    description: 'Filter by agent type',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    type: [String],
    description: 'Filter by priority levels',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({ status: 200, description: 'Approval queue items retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getApprovalQueue(@CurrentUserId() userId: string, @Query() dto: GetApprovalQueueDto) {
    return this.approvalQueueService.getApprovalQueue(userId, dto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get approval queue statistics',
    description:
      'Retrieve statistics showing total, pending, approved, rejected, and executed items count',
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getStats(@CurrentUserId() userId: string) {
    return this.approvalQueueService.getStats(userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get approval queue item by ID',
    description:
      'Retrieve detailed information about a specific approval queue item including email thread and activity log',
  })
  @ApiParam({ name: 'id', type: String, description: 'Approval queue item ID' })
  @ApiResponse({ status: 200, description: 'Approval queue item retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getApprovalQueueById(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.approvalQueueService.getApprovalQueueById(userId, id);
  }

  @Post('actions/:id/approve')
  @ApiOperation({
    summary: 'Approve an action',
    description: 'Approve a pending action in the approval queue and execute it',
  })
  @ApiParam({ name: 'id', type: String, description: 'Action ID' })
  @ApiResponse({ status: 200, description: 'Action approved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Action not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @HttpCode(HttpStatus.OK)
  async approveItem(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.approvalQueueService.approveAction(userId, id, userId);
  }

  @Post('actions/:id/reject')
  @ApiOperation({
    summary: 'Reject an action',
    description: 'Reject a pending action in the approval queue with a reason',
  })
  @ApiParam({ name: 'id', type: String, description: 'Action ID' })
  @ApiBody({ type: RejectItemDto })
  @ApiResponse({ status: 200, description: 'Action rejected successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Action not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @HttpCode(HttpStatus.OK)
  async rejectItem(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: RejectItemDto,
  ) {
    return this.approvalQueueService.rejectAction(userId, id, userId, dto);
  }

  @Post('actions/:id/edit-and-approve')
  @ApiOperation({
    summary: 'Edit and approve an action',
    description: 'Modify the proposed response and approve it for execution',
  })
  @ApiParam({ name: 'id', type: String, description: 'Action ID' })
  @ApiBody({ type: EditAndApproveDto })
  @ApiResponse({ status: 200, description: 'Action edited and approved successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Action not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @HttpCode(HttpStatus.OK)
  async editAndApprove(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: EditAndApproveDto,
  ) {
    return this.approvalQueueService.editAndApprove(userId, id, userId, dto);
  }
}
