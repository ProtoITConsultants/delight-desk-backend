import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';

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

@UseGuards(SessionGuard)
@Controller('escalations')
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Get()
  getEscalations(@CurrentUserId() userId: string, @Query() dto: GetEscalationsDto) {
    return this.aiAssistantService.getEscalations(userId, dto);
  }

  @Get('thread')
  getEscalationsWithThread(@CurrentUserId() userId: string, @Query() dto: GetEscalationsDto) {
    return this.aiAssistantService.getEscalationsWithThread(userId, dto);
  }

  @Get('stats')
  getStats(@CurrentUserId() userId: string, @Query() dto: GetEscalationStatsDto) {
    return this.aiAssistantService.getStats(userId, dto);
  }

  // Email Signature Endpoints (must be before :id routes)
  @Get('email-signature')
  getEmailSignature(@CurrentUserId() userId: string) {
    return this.aiAssistantService.getEmailSignature(userId);
  }

  @Put('email-signature/structured')
  updateStructuredSignature(
    @CurrentUserId() userId: string,
    @Body() dto: UpdateStructuredSignatureDto,
  ) {
    return this.aiAssistantService.updateStructuredSignature(userId, dto);
  }

  @Put('email-signature/html')
  updateHtmlSignature(@CurrentUserId() userId: string, @Body() dto: UpdateHtmlSignatureDto) {
    return this.aiAssistantService.updateHtmlSignature(userId, dto);
  }

  @Patch('bulk/status')
  bulkUpdateStatus(@CurrentUserId() userId: string, @Body() dto: BulkUpdateEscalationStatusDto) {
    return this.aiAssistantService.bulkUpdateStatus(userId, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateEscalationStatusDto,
  ) {
    return this.aiAssistantService.updateStatus(userId, id, dto);
  }

  @Post(':id/send-response')
  sendResponse(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SendEscalationResponseDto,
  ) {
    return this.aiAssistantService.sendEscalationResponse(userId, id, dto);
  }

  @Post(':id/generate-ai-response')
  generateAiResponse(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: GenerateAiResponseDto,
  ) {
    return this.aiAssistantService.generateAiResponse(userId, id, dto);
  }
}
