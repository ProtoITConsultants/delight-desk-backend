import { AgentTypes } from 'src/common/agent-types';
import { WooCommerceService } from '../woocommerce/woocommerce.service';
import { AgentsRepository } from 'src/database/repos/agents.repository';
import { UpdateSystemSettingsDto, UpdateUserAgentDto } from './agents.dto';
import { UserAgentsRepository } from 'src/database/repos/user-agents.repository';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { UserStoreConnectionsRepository } from 'src/database/repos/user-store-connections.repository';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class AgentsService {
  constructor(
    private readonly agentsRepo: AgentsRepository,
    private readonly userAgentsRepo: UserAgentsRepository,
    private readonly wooCommerceService: WooCommerceService,
    private readonly storeRepo: UserStoreConnectionsRepository,
    private readonly systemSettingsRepo: SystemSettingsRepository,
  ) {}

  async getAgentsForUser(userId: string) {
    return await this.agentsRepo.getAgentsForUser(userId);
  }

  async updateUserAgentSettings(userId: string, agentId: string, dto: UpdateUserAgentDto) {
    if (dto.isEnabled === undefined && dto.requiresModeration === undefined) {
      throw new BadRequestException('At least one field must be provided.');
    }

    const agent = await this.agentsRepo.getAgentById(agentId);
    if (!agent) throw new NotFoundException('Agent not found');

    if (agent.type === AgentTypes.WISMO && dto.isEnabled !== undefined) {
      await this.handleWismoEnable(userId, dto.isEnabled);
    }

    const updateData: Partial<UpdateUserAgentDto> = {};
    if (dto.isEnabled !== undefined) updateData.isEnabled = dto.isEnabled;
    if (dto.requiresModeration !== undefined)
      updateData.requiresModeration = dto.requiresModeration;

    await this.userAgentsRepo.update(userId, agentId, updateData);
  }

  private async handleWismoEnable(userId: string, isEnabled: boolean) {
    if (isEnabled) {
      const hasStore = await this.storeRepo.userHasStore(userId);
      if (!hasStore) {
        throw new ConflictException(
          'Please connect the WooCommerce store before enabling WISMO agent',
        );
      }

      const { status } = await this.wooCommerceService.getWoocommerceTrackingPluginStatus(userId);
      if (status !== 'active') {
        throw new ConflictException(
          'You do not have enough tracking info to proceed for WISMO agent',
        );
      }

      await this.updateSystemSettings(userId, { hasTrackingPluginForWoocommerce: true });
    } else {
      await this.updateSystemSettings(userId, { hasTrackingPluginForWoocommerce: false });
    }
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
