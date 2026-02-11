import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AiIdentityRepository } from '../../../../database/repos/ai-identity.repository';
import { AgentsService } from '../../../agents/agents.service';

@Injectable()
@Activity()
export class AiIdentityActivities {
  constructor(
    private readonly aiIdentityRepository: AiIdentityRepository,
    private readonly agentsService: AgentsService,
  ) {}

  @ActivityMethod({ name: 'getAiIdentity' })
  async getAiIdentity(userId: string): Promise<any> {
    return this.aiIdentityRepository.findByUserId(userId);
  }

  @ActivityMethod({ name: 'getUserAgentSettings' })
  async getUserAgentSettings(
    userId: string,
    agentType: string,
  ): Promise<{
    isEnabled: boolean | undefined;
    requiresModeration: boolean | undefined;
  }> {
    const userAgents = await this.agentsService.getAgentsForUser(userId);
    const currentAgent = userAgents.find((agent) => agent.type === agentType);
    return {
      isEnabled: currentAgent?.isEnabled,
      requiresModeration: currentAgent?.requiresModeration,
    };
  }
}
