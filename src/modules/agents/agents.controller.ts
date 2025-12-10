import { AgentsService } from './agents.service';
import { UpdateSystemSettingsDto, UpdateUserAgentDto } from './agents.dto';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { Controller, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';

@UseGuards(SessionGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  async getAgentsForUser(@CurrentUserId() userId: string) {
    return this.agentsService.getAgentsForUser(userId);
  }

  @Get('/settings')
  async getSettings(@CurrentUserId() userId: string) {
    return this.agentsService.getSystemSettings(userId);
  }

  @Patch('/settings')
  async updateSettings(@Body() dto: UpdateSystemSettingsDto, @CurrentUserId() userId: string) {
    return this.agentsService.updateSystemSettings(userId, dto);
  }

  @Patch(':agentId')
  async updateUserAgent(
    @Param('agentId') agentId: string,
    @CurrentUserId() userId: string,
    @Body() body: UpdateUserAgentDto,
  ) {
    return this.agentsService.updateUserAgentSettings(userId, agentId, body);
  }
}
