import { ProductKnowledgeRetrievalService } from './product-knowledge-retrieval.service';

describe('ProductKnowledgeRetrievalService', () => {
  it('filters by similarity and token budget', async () => {
    const embeddingsRepository = {
      similaritySearch: jest.fn().mockResolvedValue([
        {
          chunkId: 'c-1',
          sourceId: 's-1',
          content: 'Compatible with iPhone 15',
          tokenCount: 300,
          sourceTitle: 'Compatibility',
          sourceUrl: 'https://example.com/compatibility',
          sourceType: 'url',
          similarity: 0.91,
        },
        {
          chunkId: 'c-2',
          sourceId: 's-2',
          content: 'Requires 20W USB-C adapter',
          tokenCount: 500,
          sourceTitle: 'Power Requirements',
          sourceUrl: null,
          sourceType: 'manual',
          similarity: 0.79,
        },
        {
          chunkId: 'c-3',
          sourceId: 's-3',
          content: 'Low relevance content',
          tokenCount: 200,
          sourceTitle: 'Other',
          sourceUrl: null,
          sourceType: 'manual',
          similarity: 0.44,
        },
      ]),
    };

    const openaiService = {
      createEmbeddings: jest.fn().mockResolvedValue({
        data: [{ embedding: [0.11, 0.22, 0.33] }],
      }),
    };

    const service = new ProductKnowledgeRetrievalService(
      embeddingsRepository as any,
      openaiService as any,
    );

    const result = await service.retrieve({
      userId: 'user-1',
      query: 'Will this charger work with iPhone 15?',
      topK: 10,
      minSimilarity: 0.7,
      maxTokens: 700,
    });

    expect(result.selectedChunks).toHaveLength(1);
    expect(result.selectedChunks[0].chunkId).toBe('c-1');
    expect(result.skippedBySimilarity).toBe(1);
    expect(result.skippedByTokenBudget).toBe(1);
    expect(result.usedTokens).toBe(300);
  });

  it('deduplicates near-identical content across different sourceIds', async () => {
    const duplicateContent =
      'Bars are certified gluten free and lab tested. Packaging confirms gluten free certification.';

    const embeddingsRepository = {
      similaritySearch: jest.fn().mockResolvedValue([
        {
          chunkId: 'c-1',
          sourceId: 's-1',
          content: duplicateContent,
          tokenCount: 250,
          sourceTitle: 'Source A',
          sourceUrl: 'https://example.com/a',
          sourceType: 'url',
          similarity: 0.72,
        },
        {
          chunkId: 'c-2',
          sourceId: 's-2',
          content: duplicateContent,
          tokenCount: 250,
          sourceTitle: 'Source B',
          sourceUrl: 'https://example.com/b',
          sourceType: 'url',
          similarity: 0.71,
        },
      ]),
    };

    const openaiService = {
      createEmbeddings: jest.fn().mockResolvedValue({
        data: [{ embedding: [0.31, 0.22, 0.13] }],
      }),
    };

    const service = new ProductKnowledgeRetrievalService(
      embeddingsRepository as any,
      openaiService as any,
    );

    const result = await service.retrieve({
      userId: 'user-1',
      query: 'Are bars certified gluten free?',
      topK: 8,
      minSimilarity: 0.65,
      maxTokens: 1200,
    });

    expect(result.totalMatches).toBe(1);
    expect(result.selectedChunks).toHaveLength(1);
    expect(result.selectedChunks[0].chunkId).toBe('c-1');
  });
});
