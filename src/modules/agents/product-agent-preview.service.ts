import { Injectable } from '@nestjs/common';
import { AgentTypes } from 'src/common/agent-types';
import { AgentsRepository } from 'src/database/repos/agents.repository';
import { AiIdentityRepository } from 'src/database/repos/ai-identity.repository';
import { ProductKnowledgeService } from '../ai-team-center/product-knowledge.service';
import { OpenAIService } from '../openai/openai.service';
import { MessageFormattingHelper } from '../temporal/activities/shared/message-formatting.helper';
import { PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD } from '../temporal/workflows/agents/product/product.constants';
import {
  PRODUCT_MIN_CONTEXT_TOKENS,
  PRODUCT_RETRIEVAL_DEFAULTS,
  PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD,
} from '../temporal/workflows/agents/product/product.constants';
import { ClassificationUtil } from '../temporal/utils/classification.util';
import {
  ProductPreviewBlockReason,
  ProductPreviewDto,
  ProductPreviewResponse,
} from './agents.dto';

@Injectable()
export class ProductAgentPreviewService {
  constructor(
    private readonly classificationUtil: ClassificationUtil,
    private readonly productKnowledgeService: ProductKnowledgeService,
    private readonly agentsRepo: AgentsRepository,
    private readonly aiIdentityRepository: AiIdentityRepository,
    private readonly openaiService: OpenAIService,
    private readonly messageFormattingHelper: MessageFormattingHelper,
  ) {}

  async previewProductResponse(userId: string, dto: ProductPreviewDto): Promise<ProductPreviewResponse> {
    const userAgents = await this.agentsRepo.getAgentsForUser(userId);
    const productAgent = userAgents.find((agent) => agent.type === AgentTypes.PRODUCT);
    const requiresModeration = Boolean(productAgent?.requiresModeration);

    const classification = await this.classificationUtil.classify({
      subject: 'Product agent preview test',
      fromEmail: dto.customerEmail || 'customer@example.com',
      body: dto.question,
    });

    const retrieval = await this.productKnowledgeService.retrieveForQuery({
      userId,
      query: dto.question,
      ...PRODUCT_RETRIEVAL_DEFAULTS,
    });

    const topSimilarity = retrieval.selectedChunks.length
      ? Math.max(...retrieval.selectedChunks.map((chunk) => chunk.similarity))
      : null;

    const baseResponse = {
      moderationRequired: requiresModeration,
      classification: {
        category: classification.category,
        confidence: classification.confidence,
        scenarios: {
          escalation: Boolean(classification.scenarios?.escalation),
          thankful: Boolean(classification.scenarios?.thankful),
        },
      },
      retrieval: {
        chunkCount: retrieval.selectedChunks.length,
        topSimilarity,
        usedTokens: retrieval.usedTokens,
        totalMatches: retrieval.totalMatches,
        skippedBySimilarity: retrieval.skippedBySimilarity,
        skippedByTokenBudget: retrieval.skippedByTokenBudget,
      },
    };

    if (!productAgent?.isEnabled) {
      return this.blockedResponse('agent_disabled', baseResponse);
    }

    if (classification.category !== AgentTypes.PRODUCT) {
      return this.blockedResponse('non_product_intent', baseResponse);
    }

    if (classification.confidence < PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD) {
      return this.blockedResponse('low_classification_confidence', baseResponse);
    }

    if (classification.scenarios?.escalation) {
      return this.blockedResponse('escalation_scenario', baseResponse);
    }

    if (!retrieval.selectedChunks.length) {
      return this.blockedResponse('no_product_knowledge', baseResponse);
    }

    if (topSimilarity !== null && topSimilarity < PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD) {
      return this.blockedResponse('low_similarity', baseResponse);
    }

    if (retrieval.usedTokens < PRODUCT_MIN_CONTEXT_TOKENS) {
      return this.blockedResponse('insufficient_context_tokens', baseResponse);
    }

    const aiIdentity = await this.aiIdentityRepository.findByUserId(userId);
    const customerName = dto.customerName?.trim() || 'there';

    const responseText = await this.generateProductKnowledgeResponse({
      customerQuery: dto.question,
      customerName,
      knowledgeChunks: retrieval.selectedChunks,
      aiIdentity,
    });

    return {
      ...baseResponse,
      status: requiresModeration ? 'needs_moderation' : 'generated',
      responseText,
    };
  }

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
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(params.aiIdentity);
    const knowledgeContext = params.knowledgeChunks
      .map(
        (chunk, index) =>
          `Source ${index + 1}: ${chunk.sourceTitle}${chunk.sourceUrl ? ` (${chunk.sourceUrl})` : ''}\nSimilarity: ${chunk.similarity.toFixed(3)}\n${chunk.content}`,
      )
      .join('\n\n---\n\n');

    const prompt = `
      Generate a product support response for the customer query using ONLY the retrieved product knowledge.

      Customer Query: ${params.customerQuery}
      ${params.aiIdentity?.aiAgentName ? `AI Agent Name: ${params.aiIdentity.aiAgentName}` : ''}
      ${params.aiIdentity?.aiAgentTitle ? `AI Agent Title: ${params.aiIdentity.aiAgentTitle}` : ''}

      Retrieved Product Knowledge:
      ${knowledgeContext}

      Instructions:
      1. Answer directly and clearly using only the retrieved knowledge.
      2. Cover product specs, compatibility, usage recommendations, and pre/post-sale context when relevant.
      3. If something is not explicitly in the knowledge, say it is not available in the current knowledge.
      4. Do not invent facts or guarantees.
      5. Keep it concise and useful (under 220 tokens).
      6. Do not include a salutation at the beginning (it is added automatically).
      7. Do not address the customer by name in the body.
      8. Do not include a signature/sign-off at the end.
${voiceContext}
    `;

    const response = await this.openaiService.createChatCompletion(
      [
        {
          role: 'system',
          content:
            'You are a careful product support assistant. Use only provided knowledge and avoid hallucinations.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      0.3,
    );

    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);
    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      params.customerName,
      params.aiIdentity,
    );
  }

  private blockedResponse(
    reason: ProductPreviewBlockReason,
    baseResponse: Omit<ProductPreviewResponse, 'status'>,
  ): ProductPreviewResponse {
    return {
      ...baseResponse,
      status: 'blocked',
      blockReason: reason,
    };
  }
}
