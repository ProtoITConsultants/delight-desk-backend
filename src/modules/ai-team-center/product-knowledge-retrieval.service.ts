import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ProductKnowledgeEmbeddingsRepository } from '../../database/repos/product-knowledge-embeddings.repository';
import { OpenAIService } from '../openai/openai.service';

export type ProductKnowledgeRetrievedChunk = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string | null;
  sourceType: string;
  content: string;
  tokenCount: number;
  similarity: number;
};

export type ProductKnowledgeRetrievalResult = {
  query: string;
  totalMatches: number;
  usedTokens: number;
  selectedChunks: ProductKnowledgeRetrievedChunk[];
  skippedBySimilarity: number;
  skippedByTokenBudget: number;
};

@Injectable()
export class ProductKnowledgeRetrievalService {
  private readonly embeddingModel = 'text-embedding-3-small';

  constructor(
    private readonly embeddingsRepository: ProductKnowledgeEmbeddingsRepository,
    private readonly openaiService: OpenAIService,
  ) {}

  async retrieve(params: {
    userId: string;
    query: string;
    topK?: number;
    minSimilarity?: number;
    maxTokens?: number;
  }): Promise<ProductKnowledgeRetrievalResult> {
    const topK = params.topK ?? 8;
    const minSimilarity = params.minSimilarity ?? 0.65;
    const maxTokens = params.maxTokens ?? 1200;

    const embeddingResponse = await this.openaiService.createEmbeddings(
      params.query,
      this.embeddingModel,
    );
    const queryEmbedding = embeddingResponse.data[0]?.embedding ?? [];

    const matches = await this.embeddingsRepository.similaritySearch({
      userId: params.userId,
      queryEmbedding,
      limit: topK,
    });
    const deduplicatedMatches = this.deduplicateMatchesByContent(matches);

    const selectedChunks: ProductKnowledgeRetrievedChunk[] = [];
    let usedTokens = 0;
    let skippedBySimilarity = 0;
    let skippedByTokenBudget = 0;

    for (const match of deduplicatedMatches) {
      const similarity = Number(match.similarity);
      if (similarity < minSimilarity) {
        skippedBySimilarity += 1;
        continue;
      }

      const tokenCount = Number(match.tokenCount);
      if (usedTokens + tokenCount > maxTokens) {
        skippedByTokenBudget += 1;
        continue;
      }

      selectedChunks.push({
        chunkId: match.chunkId,
        sourceId: match.sourceId,
        sourceTitle: match.sourceTitle,
        sourceUrl: match.sourceUrl,
        sourceType: match.sourceType,
        content: match.content,
        tokenCount,
        similarity,
      });
      usedTokens += tokenCount;
    }

    if (
      selectedChunks.length === 0 &&
      deduplicatedMatches.length > 0 &&
      skippedBySimilarity === deduplicatedMatches.length
    ) {
      const relaxedThreshold = Math.max(0.45, minSimilarity - 0.15);
      usedTokens = 0;
      skippedByTokenBudget = 0;
      skippedBySimilarity = 0;

      for (const match of deduplicatedMatches) {
        const similarity = Number(match.similarity);
        if (similarity < relaxedThreshold) {
          skippedBySimilarity += 1;
          continue;
        }

        const tokenCount = Number(match.tokenCount);
        if (usedTokens + tokenCount > maxTokens) {
          skippedByTokenBudget += 1;
          continue;
        }

        selectedChunks.push({
          chunkId: match.chunkId,
          sourceId: match.sourceId,
          sourceTitle: match.sourceTitle,
          sourceUrl: match.sourceUrl,
          sourceType: match.sourceType,
          content: match.content,
          tokenCount,
          similarity,
        });
        usedTokens += tokenCount;
      }
    }

    return {
      query: params.query,
      totalMatches: deduplicatedMatches.length,
      usedTokens,
      selectedChunks,
      skippedBySimilarity,
      skippedByTokenBudget,
    };
  }

  private deduplicateMatchesByContent(matches: any[]) {
    const uniqueMatches: any[] = [];
    const seenFingerprints = new Set<string>();

    for (const match of matches) {
      const fingerprint = this.contentFingerprint(match.content);
      if (seenFingerprints.has(fingerprint)) {
        continue;
      }
      seenFingerprints.add(fingerprint);
      uniqueMatches.push(match);
    }

    return uniqueMatches;
  }

  private contentFingerprint(content: string): string {
    const normalized = content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
    return createHash('sha256').update(normalized).digest('hex');
  }
}
