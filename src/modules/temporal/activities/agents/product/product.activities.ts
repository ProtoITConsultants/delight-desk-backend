import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ProductKnowledgeService } from 'src/modules/ai-team-center/product-knowledge.service';
import { ProductAgentPreviewService } from 'src/modules/agents/product-agent-preview.service';

@Injectable()
@Activity()
export class ProductActivities {
  constructor(
    private readonly productKnowledgeService: ProductKnowledgeService,
    private readonly productAgentPreviewService: ProductAgentPreviewService,
  ) {}

  @ActivityMethod({ name: 'retrieveProductKnowledgeContext' })
  async retrieveProductKnowledgeContext(params: {
    userId: string;
    query: string;
    topK?: number;
    minSimilarity?: number;
    maxTokens?: number;
  }) {
    return this.productKnowledgeService.retrieveForQuery(params);
  }

  @ActivityMethod({ name: 'generateProductKnowledgeResponse' })
  async generateProductKnowledgeResponse(params: {
    customerQuery: string;
    customerName: string;
    knowledgeChunks: Array<{
      sourceTitle: string;
      sourceUrl: string | null;
      content: string;
      similarity: number;
    }>;
    aiIdentity?: any;
  }): Promise<string> {
    return this.productAgentPreviewService.generateProductKnowledgeResponse(params);
  }
}
