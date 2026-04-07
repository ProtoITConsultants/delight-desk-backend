import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AgentsService } from './agents.service';

describe('AgentsService.updateUserAgentSettings', () => {
  function createService({
    agentExists = true,
    hasStore = true,
  }: { agentExists?: boolean; hasStore?: boolean } = {}) {
    const agentsRepo = {
      getAgentById: jest.fn().mockResolvedValue(agentExists ? { id: 'agent-1' } : null),
    };
    const userAgentsRepo = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    const storeRepo = {
      userHasStore: jest.fn().mockResolvedValue(hasStore),
    };

    const service = new AgentsService(
      {} as any,
      agentsRepo as any,
      userAgentsRepo as any,
      {} as any,
      {} as any,
      {} as any,
      storeRepo as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, agentsRepo, userAgentsRepo, storeRepo };
  }

  it('accepts explicit false values and updates both flags', async () => {
    const { service, userAgentsRepo, storeRepo } = createService();

    await service.updateUserAgentSettings('user-1', 'agent-1', {
      isEnabled: false,
      requiresModeration: false,
    });

    expect(storeRepo.userHasStore).not.toHaveBeenCalled();
    expect(userAgentsRepo.update).toHaveBeenCalledWith('user-1', 'agent-1', {
      isEnabled: false,
      requiresModeration: false,
    });
  });

  it('throws bad request when no fields are provided', async () => {
    const { service } = createService();

    await expect(service.updateUserAgentSettings('user-1', 'agent-1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('checks store connection only when enabling agent', async () => {
    const { service } = createService({ hasStore: false });

    await expect(
      service.updateUserAgentSettings('user-1', 'agent-1', {
        isEnabled: true,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws not found for unknown agent', async () => {
    const { service } = createService({ agentExists: false });

    await expect(
      service.updateUserAgentSettings('user-1', 'missing-agent', {
        isEnabled: false,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
