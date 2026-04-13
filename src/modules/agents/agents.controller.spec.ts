import { AgentsController } from './agents.controller';

describe('AgentsController', () => {
  it('delegates product preview generation to agents service', async () => {
    const agentsService = {
      generateProductPreview: jest.fn().mockResolvedValue({
        from: 'owner@example.com',
        to: 'customer@example.com',
        subject: 'Re: Product Inquiry',
        body: 'Hi customer,\n\nSample preview body.',
      }),
    };
    const controller = new AgentsController(agentsService as any);
    const dto = { query: 'Can I use this product while fasting?' };

    const result = await controller.previewProductResponse('user-1', dto as any);

    expect(agentsService.generateProductPreview).toHaveBeenCalledWith('user-1', dto);
    expect(result).toEqual({
      from: 'owner@example.com',
      to: 'customer@example.com',
      subject: 'Re: Product Inquiry',
      body: 'Hi customer,\n\nSample preview body.',
    });
  });
});
