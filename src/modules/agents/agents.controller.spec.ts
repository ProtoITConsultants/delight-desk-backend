import { AgentsController } from './agents.controller';

describe('AgentsController', () => {
  it('delegates product preview generation to agents service', async () => {
    const agentsService = {
      generateProductPreview: jest.fn().mockResolvedValue({
        status: 'generated',
      }),
    };
    const controller = new AgentsController(agentsService as any);
    const dto = { question: 'Can I use this product while fasting?' };

    const result = await controller.previewProductResponse('user-1', dto as any);

    expect(agentsService.generateProductPreview).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({ status: 'generated' });
  });
});
