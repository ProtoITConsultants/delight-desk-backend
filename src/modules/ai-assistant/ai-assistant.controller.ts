import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { AiAssistantService } from './ai-assistant.service';
import {
  BulkUpdateEscalationStatusDto,
  GenerateAiResponseDto,
  GetEscalationsDto,
  GetEscalationStatsDto,
  SendEscalationResponseDto,
  UpdateEscalationStatusDto,
  UpdateHtmlSignatureDto,
  UpdateStructuredSignatureDto,
} from './ai-assistant.dto';

@ApiTags('AI Assistant')
@ApiCookieAuth('connect.sid')
@UseGuards(SessionGuard)
@Controller('escalations')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get()
  @ApiOperation({
    summary: 'Get escalations list',
    description:
      'Retrieve paginated list of escalations with filtering, sorting, and search capabilities',
  })
  @ApiResponse({ status: 200, description: 'Escalations list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getEscalations(@CurrentUserId() userId: string, @Query() dto: GetEscalationsDto) {
    return this.aiAssistantService.getEscalations(userId, dto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get escalation statistics',
    description:
      'Retrieve aggregated statistics about escalations including counts by status and priority',
  })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getStats(@CurrentUserId() userId: string, @Query() dto: GetEscalationStatsDto) {
    return this.aiAssistantService.getStats(userId, dto);
  }

  // Email Signature Endpoints (must be before :id routes)
  @Get('email-signature')
  @ApiOperation({
    summary: 'Get email signature',
    description:
      'Retrieve current email signature settings including both structured and HTML formats',
  })
  @ApiResponse({ status: 200, description: 'Email signature retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getEmailSignature(@CurrentUserId() userId: string) {
    return this.aiAssistantService.getEmailSignature(userId);
  }

  @Put('email-signature/structured')
  @ApiOperation({
    summary: 'Update structured email signature',
    description: 'Update email signature using structured fields (name, title, company, etc.)',
  })
  @ApiBody({ type: UpdateStructuredSignatureDto })
  @ApiResponse({ status: 200, description: 'Structured signature updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  updateStructuredSignature(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateStructuredSignatureDto,
  ) {
    return this.aiAssistantService.updateStructuredSignature(userId, dto);
  }

  @Put('email-signature/html')
  @ApiOperation({
    summary: 'Update HTML email signature',
    description: 'Update email signature with custom HTML content for advanced formatting',
  })
  @ApiBody({ type: UpdateHtmlSignatureDto })
  @ApiResponse({ status: 200, description: 'HTML signature updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid HTML content' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  updateHtmlSignature(@CurrentUserId() userId: string, @Body() dto: UpdateHtmlSignatureDto) {
    return this.aiAssistantService.updateHtmlSignature(userId, dto);
  }

  @Patch('bulk/status')
  @ApiOperation({
    summary: 'Bulk update escalation status',
    description: 'Update status for multiple escalations at once (up to 50 items)',
  })
  @ApiBody({ type: BulkUpdateEscalationStatusDto })
  @ApiResponse({ status: 200, description: 'Bulk status update completed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data or too many items' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  bulkUpdateStatus(@CurrentUserId() userId: string, @Body() dto: BulkUpdateEscalationStatusDto) {
    return this.aiAssistantService.bulkUpdateStatus(userId, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get escalation by ID',
    description: 'Retrieve detailed information about a specific escalation',
  })
  @ApiParam({ name: 'id', type: String, description: 'Escalation ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Escalation details retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Escalation not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getEscalationById(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.aiAssistantService.getEscalationById(userId, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update escalation status',
    description: 'Update the status of a specific escalation with optional notes',
  })
  @ApiParam({ name: 'id', type: String, description: 'Escalation ID (UUID)' })
  @ApiBody({ type: UpdateEscalationStatusDto })
  @ApiResponse({ status: 200, description: 'Escalation status updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid status or input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Escalation not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  updateStatus(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEscalationStatusDto,
  ) {
    return this.aiAssistantService.updateStatus(userId, id, dto);
  }

  @Post(':id/send-response')
  @ApiOperation({
    summary: 'Send escalation response',
    description: 'Send an email response to the escalated customer issue',
  })
  @ApiParam({ name: 'id', type: String, description: 'Escalation ID (UUID)' })
  @ApiBody({ type: SendEscalationResponseDto })
  @ApiResponse({ status: 200, description: 'Response sent successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid message content' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Escalation not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  sendResponse(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SendEscalationResponseDto,
  ) {
    return this.aiAssistantService.sendEscalationResponse(userId, id, dto);
  }

  @Post(':id/generate-ai-response')
  @ApiOperation({
    summary: 'Generate AI response',
    description: 'Generate an AI-powered response for an escalation based on custom instructions',
  })
  @ApiParam({ name: 'id', type: String, description: 'Escalation ID (UUID)' })
  @ApiBody({ type: GenerateAiResponseDto })
  @ApiResponse({ status: 200, description: 'AI response generated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid instruction or input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Escalation not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  generateAiResponse(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: GenerateAiResponseDto,
  ) {
    return this.aiAssistantService.generateAiResponse(userId, id, dto);
  }
}
