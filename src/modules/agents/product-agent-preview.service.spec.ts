import { AgentTypes } from 'src/common/agent-types';
import { MessageFormattingHelper } from '../temporal/activities/shared/message-formatting.helper';
import { ProductAgentPreviewService } from './product-agent-preview.service';

describe('ProductAgentPreviewService', () => {
  const baseDto = { question: 'Will this work with iPhone 15?', customerName: 'Sarah' };
  const baseClassification = {
    category: AgentTypes.PRODUCT,
    confidence: 91,
    scenarios: { escalation: false, thankful: false },
  };
  const baseRetrieval = {
    query: baseDto.question,
    totalMatches: 2,
    usedTokens: 240,
    selectedChunks: [
      {
        chunkId: 'chunk-1',
        sourceId: 'source-1',
        sourceTitle: 'Compatibility FAQ',
        sourceUrl: null,
        sourceType: 'manual',
        content: 'This product is compatible with iPhone 15.',
        tokenCount: 140,
        similarity: 0.83,
      },
    ],
    skippedBySimilarity: 0,
    skippedByTokenBudget: 0,
  };

  function createService({
    agentEnabled = true,
    requiresModeration = false,
    classification = baseClassification,
    retrieval = baseRetrieval,
  }: {
    agentEnabled?: boolean;
    requiresModeration?: boolean;
    classification?: any;
    retrieval?: any;
  }) {
    const classificationUtil = {
      classify: jest.fn().mockResolvedValue(classification),
    };
    const productKnowledgeService = {
      retrieveForQuery: jest.fn().mockResolvedValue(retrieval),
    };
    const agentsRepo = {
      getAgentsForUser: jest.fn().mockResolvedValue([
        { type: AgentTypes.PRODUCT, isEnabled: agentEnabled, requiresModeration },
      ]),
    };
    const aiIdentityRepository = {
      findByUserId: jest.fn().mockResolvedValue({
        emailSalutation: 'Hi',
        aiAgentName: 'Ari',
        aiAgentTitle: 'Product Specialist',
      }),
    };
    const openaiService = {
      createChatCompletion: jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'You can check the compatibility guide.' } }],
      }),
    };
    const messageFormattingHelper = new MessageFormattingHelper();

    const service = new ProductAgentPreviewService(
      classificationUtil as any,
      productKnowledgeService as any,
      agentsRepo as any,
      aiIdentityRepository as any,
      openaiService as any,
      messageFormattingHelper,
    );

    return {
      service,
      mocks: {
        classificationUtil,
        productKnowledgeService,
        agentsRepo,
        aiIdentityRepository,
        openaiService,
      },
    };
  }

  it('blocks when intent is not product', async () => {
    const { service } = createService({
      classification: { ...baseClassification, category: AgentTypes.WISMO },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.status).toBe('blocked');
    expect(result.blockReason).toBe('non_product_intent');
  });

  it('blocks when confidence is below threshold', async () => {
    const { service } = createService({
      classification: { ...baseClassification, confidence: 49 },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.status).toBe('blocked');
    expect(result.blockReason).toBe('low_classification_confidence');
  });

  it('blocks when escalation scenario is detected', async () => {
    const { service } = createService({
      classification: {
        ...baseClassification,
        scenarios: { escalation: true, thankful: false },
      },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.status).toBe('blocked');
    expect(result.blockReason).toBe('escalation_scenario');
  });

  it('blocks when top retrieval similarity is too low', async () => {
    const { service } = createService({
      retrieval: {
        ...baseRetrieval,
        usedTokens: 220,
        selectedChunks: [{ ...baseRetrieval.selectedChunks[0], similarity: 0.5 }],
      },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.status).toBe('blocked');
    expect(result.blockReason).toBe('low_similarity');
  });

  it('generates preview response on happy path', async () => {
    const { service, mocks } = createService({});

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.status).toBe('generated');
    expect(result.responseText).toContain('Hi Sarah');
    expect(mocks.openaiService.createChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('returns needs_moderation when product agent moderation is enabled', async () => {
    const { service } = createService({ requiresModeration: true });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.status).toBe('needs_moderation');
    expect(result.moderationRequired).toBe(true);
    expect(result.responseText).toBeDefined();
  });
});
