import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';

import { AiIdentityService } from './ai-identity.service';
import {
  AiIdentityResponseDto,
  CreateAiIdentityDto,
  GeneratedNameDto,
  GenerateNamesDto,
  UpdateAiIdentityDto,
} from './dto/ai-identity.dto';
import { SessionGuard } from '../../guards/session.guard';
import { CurrentUserId } from '../../decorators/current-user.decorator';

@UseGuards(SessionGuard)
@Controller('ai-team-center/identity')
export class AiIdentityController {
  constructor(private readonly aiIdentityService: AiIdentityService) {}

  @Get()
  async getIdentity(@CurrentUserId() userId: string) {
    return this.aiIdentityService.getIdentity(userId);
  }

  @Post()
  async createOrUpdateIdentity(@CurrentUserId() userId: string, @Body() dto: CreateAiIdentityDto) {
    return this.aiIdentityService.createOrUpdateIdentity(userId, dto);
  }

  @Patch()
  async updateIdentity(@CurrentUserId() userId: string, @Body() dto: UpdateAiIdentityDto) {
    return this.aiIdentityService.updateIdentity(userId, dto);
  }

  @Post('generate-names')
  async generateNames(@Body() dto: GenerateNamesDto) {
    return this.aiIdentityService.generateNames(dto.customerDescription);
  }
}
