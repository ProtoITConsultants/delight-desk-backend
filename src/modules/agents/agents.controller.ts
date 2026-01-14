import { AgentsService } from './agents.service';
import { UpdateSystemSettingsDto, UpdateUserAgentDto, WismoPreviewDto } from './agents.dto';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

@UseGuards(SessionGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  getAgentsForUser(@CurrentUserId() userId: string) {
    return this.agentsService.getAgentsForUser(userId);
  }

  @Get('/settings')
  getSettings(@CurrentUserId() userId: string) {
    return this.agentsService.getSystemSettings(userId);
  }

  @Patch('/settings')
  updateSettings(@Body() dto: UpdateSystemSettingsDto, @CurrentUserId() userId: string) {
    return this.agentsService.updateSystemSettings(userId, dto);
  }

  @Patch(':agentId')
  updateUserAgent(
    @Param('agentId') agentId: string,
    @CurrentUserId() userId: string,
    @Body() body: UpdateUserAgentDto,
  ) {
    return this.agentsService.updateUserAgentSettings(userId, agentId, body);
  }

  @Post('/wismo/preview')
  previewWismoResponse(@CurrentUserId() userId: string, @Body() dto: WismoPreviewDto) {
    return this.agentsService.generateWismoPreview(userId, dto);
  }
}
