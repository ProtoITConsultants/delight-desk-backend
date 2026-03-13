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
import {
  CancelWorkflowDto,
  EditAndApproveDto,
  GetApprovalQueueDto,
  GetWorkflowProgressItemsDto,
  RejectItemDto,
} from './approval-queue.dto';
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
      'Retrieve paginated list of items in the approval queue with filtering options by status, agent type, and priority. Each item includes originalCustomerEmailBody and workflowActions.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'in_progress', 'cancelled', 'escalated', 'completed'],
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    description: 'Filter by agent category',
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
  @ApiResponse({
    status: 200,
    description: 'Approval queue items retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalItems: { type: 'number' },
            itemsPerPage: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPreviousPage: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getApprovalQueueItems(@CurrentUserId() userId: string, @Query() dto: GetApprovalQueueDto) {
    return this.approvalQueueService.getApprovalQueueItems(userId, dto);
  }

  @Get('workflows')
  @ApiOperation({
    summary: 'Get workflow progress items',
    description:
      'Retrieve lightweight paginated workflow cards for agent UI, including current progress/timeline. Supports category filtering (default: order_cancellation).',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    description: 'Workflow category filter (default: order_cancellation)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'in_progress', 'cancelled', 'escalated', 'completed'],
    description: 'Filter by workflow status',
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
  @ApiResponse({
    status: 200,
    description: 'Workflow progress items retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'array', items: { type: 'object' } },
        pagination: {
          type: 'object',
          properties: {
            currentPage: { type: 'number' },
            totalPages: { type: 'number' },
            totalItems: { type: 'number' },
            itemsPerPage: { type: 'number' },
            hasNextPage: { type: 'boolean' },
            hasPreviousPage: { type: 'boolean' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getWorkflowProgressItems(
    @CurrentUserId() userId: string,
    @Query() dto: GetWorkflowProgressItemsDto,
  ) {
    return this.approvalQueueService.getWorkflowProgressItems(userId, dto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get approval queue statistics',
    description:
      'Retrieve statistics showing total, pending, approved, rejected, and executed items count',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        pending: { type: 'number' },
        inProgress: { type: 'number' },
        escalated: { type: 'number' },
        cancelled: { type: 'number' },
        completed: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getStats(@CurrentUserId() userId: string) {
    return this.approvalQueueService.getStats(userId);
  }

  @Post('cancel')
  @ApiOperation({
    summary: 'Cancel a workflow',
    description:
      'Cancel a running approval queue workflow by its Temporal workflow ID. Marks all pending actions as rejected and updates the workflow status to cancelled.',
  })
  @ApiBody({ type: CancelWorkflowDto })
  @ApiResponse({
    status: 200,
    description: 'Workflow cancelled successfully',
    schema: {
      type: 'object',
      properties: { message: { type: 'string', example: 'Workflow cancelled successfully' } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Workflow already completed, escalated, or cancelled',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @HttpCode(HttpStatus.OK)
  async cancelWorkflow(@CurrentUserId() userId: string, @Body() dto: CancelWorkflowDto) {
    return this.approvalQueueService.cancelWorkflow(userId, dto.workflowId);
  }

  @Post('actions/:id/approve')
  @ApiOperation({
    summary: 'Approve an action',
    description: 'Approve a pending action in the approval queue and execute it',
  })
  @ApiParam({ name: 'id', type: String, description: 'Action ID' })
  @ApiResponse({
    status: 200,
    description: 'Action approved successfully',
    schema: {
      type: 'object',
      properties: { message: { type: 'string', example: 'Action approved successfully' } },
    },
  })
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
  @ApiResponse({
    status: 200,
    description: 'Action rejected successfully',
    schema: {
      type: 'object',
      properties: { message: { type: 'string', example: 'Action rejected successfully' } },
    },
  })
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
  @ApiResponse({
    status: 200,
    description: 'Action edited and approved successfully',
    schema: {
      type: 'object',
      properties: { message: { type: 'string', example: 'Action edited and approved successfully' } },
    },
  })
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
    return this.approvalQueueService.editAndApprove(userId, id, dto);
  }
}
