import { UpdateSystemSettingsDto, UpdateUserAgentDto } from './agents.dto';
import { AgentsRepository } from 'src/database/repos/agents.repository';
import { UserAgentsRepository } from 'src/database/repos/user-agents.repository';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';

@Injectable()
export class AgentsService {
  constructor(
    private readonly agentsRepo: AgentsRepository,
    private readonly userAgentsRepo: UserAgentsRepository,
    private readonly systemSettingsRepo: SystemSettingsRepository,
  ) {}

  async getAgentsForUser(userId: string) {
    return await this.agentsRepo.getAgentsForUser(userId);
  }

  async updateUserAgentSettings(userId: string, agentId: string, dto: UpdateUserAgentDto) {
    if (dto.isEnabled === undefined && dto.requiresModeration === undefined) {
      throw new BadRequestException('At least one field must be provided.');
    }

    const exists = await this.userAgentsRepo.findByUserAndAgent(userId, agentId);
    if (!exists) {
      throw new NotFoundException('User agent not found.');
    }

    await this.userAgentsRepo.update(userId, agentId, {
      isEnabled: dto.isEnabled,
      requiresModeration: dto.requiresModeration,
    });
  }

  async getSystemSettings(userId: string) {
    const settings = await this.systemSettingsRepo.findByUser(userId);
    if (!settings) throw new NotFoundException('Settings not found');
    return settings;
  }

  async updateSystemSettings(userId: string, dto: UpdateSystemSettingsDto) {
    const settings = await this.systemSettingsRepo.findByUser(userId);
    if (!settings) throw new NotFoundException('Settings not found');
    await this.systemSettingsRepo.update(userId, dto);
  }
}
