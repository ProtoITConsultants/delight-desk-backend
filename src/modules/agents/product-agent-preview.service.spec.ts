import { AgentTypes } from 'src/common/agent-types';
import { MessageFormattingHelper } from '../temporal/activities/shared/message-formatting.helper';
import { ProductAgentPreviewService } from './product-agent-preview.service';

describe('ProductAgentPreviewService', () => {
  const baseDto = { query: 'Will this work with iPhone 15?', customerName: 'Sarah' };
  const baseClassification = {
    category: AgentTypes.PRODUCT,
    confidence: 91,
    scenarios: { escalation: false, thankful: false },
  };
  const baseRetrieval = {
    query: baseDto.query,
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
    const userRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'owner@example.com',
      }),
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
      userRepo as any,
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
        userRepo,
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
    expect(result.body).toContain('outside product support scope');
  });

  it('blocks when confidence is below threshold', async () => {
    const { service } = createService({
      classification: { ...baseClassification, confidence: 49 },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.body).toContain("couldn't determine your product intent");
  });

  it('blocks when escalation scenario is detected', async () => {
    const { service } = createService({
      classification: {
        ...baseClassification,
        scenarios: { escalation: true, thankful: false },
      },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.body).toContain('better handled by a human support specialist');
  });

  it('blocks when top retrieval similarity is too low', async () => {
    const { service } = createService({
      retrieval: {
        ...baseRetrieval,
        usedTokens: 220,
        selectedChunks: [{ ...baseRetrieval.selectedChunks[0], similarity: 0.46 }],
      },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.body).toContain('limited matching product details');
  });

  it('allows generation with adaptive similarity when context evidence is strong', async () => {
    const { service } = createService({
      retrieval: {
        ...baseRetrieval,
        usedTokens: 735,
        selectedChunks: [
          { ...baseRetrieval.selectedChunks[0], similarity: 0.529 },
          { ...baseRetrieval.selectedChunks[0], chunkId: 'chunk-2', similarity: 0.521 },
        ],
      },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.body).toBeDefined();
  });

  it('allows recommendation query with borderline similarity and usable context', async () => {
    const { service } = createService({
      retrieval: {
        ...baseRetrieval,
        usedTokens: 107,
        selectedChunks: [{ ...baseRetrieval.selectedChunks[0], similarity: 0.481 }],
      },
    });
    const recommendationDto = {
      query: 'Do you recommend this for someone who needs fast charging?',
      customerName: 'Sarah',
    };

    const result = await service.previewProductResponse('user-1', recommendationDto);
    expect(result.body).toBeDefined();
  });

  it('still generates when relevant retrieval is concise', async () => {
    const { service } = createService({
      retrieval: {
        ...baseRetrieval,
        usedTokens: 40,
        selectedChunks: [{ ...baseRetrieval.selectedChunks[0], similarity: 0.59 }],
      },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.body).toBeDefined();
  });

  it('allows generation with relaxed context when similarity is strong', async () => {
    const { service } = createService({
      retrieval: {
        ...baseRetrieval,
        usedTokens: 60,
        selectedChunks: [{ ...baseRetrieval.selectedChunks[0], similarity: 0.61 }],
      },
    });

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.body).toBeDefined();
  });

  it('generates preview response on happy path', async () => {
    const { service, mocks } = createService({});

    const result = await service.previewProductResponse('user-1', baseDto);
    expect(result.from).toBe('owner@example.com');
    expect(result.to).toBe('customer@example.com');
    expect(result.responseText).toBeUndefined();
    expect(result.body).toContain('Hi Sarah');
    expect(mocks.openaiService.createChatCompletion).toHaveBeenCalledTimes(1);
  });

  it('uses customer defaults when name/email are omitted', async () => {
    const { service } = createService({ requiresModeration: true });

    const result = await service.previewProductResponse('user-1', { query: 'Can I use this daily?' });
    expect(result.to).toBe('customer@example.com');
    expect(result.body).toContain('Hi customer');
  });
});
