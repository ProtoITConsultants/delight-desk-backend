import { ProductKnowledgeService } from './product-knowledge.service';

describe('ProductKnowledgeService', () => {
  const makeService = () => {
    const sourcesRepository = {
      findByUserAndHash: jest.fn(),
      findLatestByUserAndSourceUrl: jest.fn(),
      create: jest.fn(),
      updateForReingestion: jest.fn(),
      updateStatus: jest.fn(),
      findById: jest.fn(),
      deleteById: jest.fn(),
      listByUser: jest.fn(),
    };
    const chunksRepository = {
      createMany: jest.fn(),
      deleteBySourceId: jest.fn(),
    };
    const embeddingsRepository = {
      createMany: jest.fn(),
    };
    const openaiService = {
      createEmbeddings: jest.fn(),
    };
    const retrievalService = {
      retrieve: jest.fn(),
    };

    const service = new ProductKnowledgeService(
      sourcesRepository as any,
      chunksRepository as any,
      embeddingsRepository as any,
      openaiService as any,
      retrievalService as any,
    );

    return {
      service,
      sourcesRepository,
      chunksRepository,
      embeddingsRepository,
      openaiService,
      retrievalService,
    };
  };

  it('ingests manual content and stores chunks + embeddings', async () => {
    const {
      service,
      sourcesRepository,
      chunksRepository,
      embeddingsRepository,
      openaiService,
    } = makeService();

    sourcesRepository.findByUserAndHash.mockResolvedValue(null);
    sourcesRepository.create.mockResolvedValue({ id: 'source-1' });
    const queueSpy = jest
      .spyOn(service as any, 'queueIngestionTask')
      .mockImplementation((task: () => Promise<void>) => {
        void task();
      });

    const result = await service.ingestManualSource('user-1', {
      title: 'Compatibility guide',
      content:
        'This product supports iPhone 15 and USB-C accessories. Make sure the power adapter is above 20W.',
    });

    expect(result.status).toBe('processing');
    expect(result.deduplicated).toBe(false);
    expect(result.queued).toBe(true);
    expect(queueSpy).toHaveBeenCalledTimes(1);
  });

  it('returns deduplicated response for already ingested content', async () => {
    const { service, sourcesRepository, chunksRepository, openaiService } = makeService();

    sourcesRepository.findByUserAndHash.mockResolvedValue({
      id: 'source-existing',
      status: 'ready',
    });

    const result = await service.ingestManualSource('user-1', {
      title: 'Specs',
      content: 'This is enough text content to pass validation and trigger dedupe behavior.',
    });

    expect(result).toEqual({
      sourceId: 'source-existing',
      status: 'ready',
      deduplicated: true,
      chunkCount: 0,
    });
    expect(chunksRepository.createMany).not.toHaveBeenCalled();
    expect(openaiService.createEmbeddings).not.toHaveBeenCalled();
  });

  it('ingests URL page content from single URL', async () => {
    const { service, sourcesRepository, chunksRepository, openaiService } = makeService();

    sourcesRepository.findByUserAndHash.mockResolvedValue(null);
    sourcesRepository.findLatestByUserAndSourceUrl.mockResolvedValue(null);
    sourcesRepository.create.mockResolvedValue({ id: 'source-url' });
    const queueSpy = jest
      .spyOn(service as any, 'queueIngestionTask')
      .mockImplementation((task: () => Promise<void>) => {
        void task();
      });

    jest.spyOn(service as any, 'fetchRenderedUrlTextContent').mockResolvedValue({
      textContent:
        'Phone Charger specs. Works with iPhone 15 and Android USB-C devices. Requires 20W adapter.',
      pageTitle: 'Product Page',
      diagnostics: {
        extractionMode: 'playwright_cheerio',
        finalUrl: 'https://example.com/products/charger',
        totalTextLength: 95,
        sectionCount: 2,
        jsonLdItems: 1,
        sample: 'Phone Charger specs',
      },
    });

    const result = await service.ingestUrlSource('user-1', {
      url: 'https://example.com/products/charger',
      title: undefined,
    });

    expect(result.status).toBe('processing');
    expect(result.queued).toBe(true);
    expect(queueSpy).toHaveBeenCalledTimes(1);
    expect(sourcesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        sourceType: 'url',
        sourceUrl: 'https://example.com/products/charger',
      }),
    );
  });

  it('re-crawls same URL in-place and replaces previous chunks', async () => {
    const { service, sourcesRepository, chunksRepository, openaiService } = makeService();

    sourcesRepository.findLatestByUserAndSourceUrl.mockResolvedValue({
      id: 'existing-source-id',
      contentHash: 'old-hash',
      status: 'ready',
      metadata: {},
    });
    sourcesRepository.findById.mockResolvedValue({
      id: 'existing-source-id',
      contentHash: 'old-hash',
      status: 'processing',
    });
    sourcesRepository.updateForReingestion.mockResolvedValue({
      id: 'existing-source-id',
    });
    let queuedTaskPromise: Promise<void> | undefined;
    const queueSpy = jest
      .spyOn(service as any, 'queueIngestionTask')
      .mockImplementation((task: () => Promise<void>) => {
        queuedTaskPromise = task();
      });

    jest.spyOn(service as any, 'fetchRenderedUrlTextContent').mockResolvedValue({
      textContent: 'Updated URL content with refreshed spec details and FAQ text.',
      pageTitle: 'Updated Product Page',
      diagnostics: {
        extractionMode: 'playwright_cheerio',
        finalUrl: 'https://example.com/products/charger',
        totalTextLength: 64,
        sectionCount: 1,
        jsonLdItems: 0,
        sample: 'Updated URL content',
      },
    });

    const result = await service.ingestUrlSource('user-1', {
      url: 'https://example.com/products/charger',
      title: 'Charger',
    });
    await queuedTaskPromise;

    expect(chunksRepository.deleteBySourceId).toHaveBeenCalledWith('user-1', 'existing-source-id');
    expect(sourcesRepository.updateForReingestion).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        sourceId: 'existing-source-id',
        sourceUrl: 'https://example.com/products/charger',
      }),
    );
    expect(sourcesRepository.create).not.toHaveBeenCalled();
    expect(result.sourceId).toBe('existing-source-id');
    expect(result.status).toBe('processing');
    expect(result.reingesting).toBe(true);
    expect(queueSpy).toHaveBeenCalledTimes(1);
    expect(result.deduplicated).toBe(false);
  });
});
