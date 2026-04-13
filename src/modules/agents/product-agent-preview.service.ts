import { Injectable, NotFoundException } from '@nestjs/common';
import { AgentTypes } from 'src/common/agent-types';
import { AgentsRepository } from 'src/database/repos/agents.repository';
import { AiIdentityRepository } from 'src/database/repos/ai-identity.repository';
import { UserRepository } from 'src/database/repos/users.repository';
import { ProductKnowledgeService } from '../ai-team-center/product-knowledge.service';
import { OpenAIService } from '../openai/openai.service';
import { MessageFormattingHelper } from '../temporal/activities/shared/message-formatting.helper';
import { PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD } from '../temporal/workflows/agents/product/product.constants';
import {
  PRODUCT_MIN_CHUNKS_FOR_SIMILARITY_RELAXATION,
  PRODUCT_MIN_TOKENS_FOR_RECOMMENDATION_SIMILARITY,
  PRODUCT_MIN_TOKENS_FOR_SIMILARITY_RELAXATION,
  PRODUCT_RECOMMENDATION_SIMILARITY_THRESHOLD,
  PRODUCT_RELAXED_SIMILARITY_THRESHOLD,
  PRODUCT_RETRIEVAL_DEFAULTS,
  PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD,
} from '../temporal/workflows/agents/product/product.constants';
import { ClassificationUtil } from '../temporal/utils/classification.util';
import { ProductPreviewDto, ProductPreviewResponse } from './agents.dto';

type ProductPreviewBlockReason =
  | 'agent_disabled'
  | 'non_product_intent'
  | 'low_classification_confidence'
  | 'escalation_scenario'
  | 'no_product_knowledge'
  | 'low_similarity';

@Injectable()
export class ProductAgentPreviewService {
  constructor(
    private readonly classificationUtil: ClassificationUtil,
    private readonly productKnowledgeService: ProductKnowledgeService,
    private readonly agentsRepo: AgentsRepository,
    private readonly userRepo: UserRepository,
    private readonly aiIdentityRepository: AiIdentityRepository,
    private readonly openaiService: OpenAIService,
    private readonly messageFormattingHelper: MessageFormattingHelper,
  ) {}

  async previewProductResponse(
    userId: string,
    dto: ProductPreviewDto,
  ): Promise<ProductPreviewResponse> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const customerName = dto.customerName?.trim() || 'customer';
    const customerEmail = dto.customerEmail?.trim() || 'customer@example.com';

    const userAgents = await this.agentsRepo.getAgentsForUser(userId);
    const productAgent = userAgents.find((agent) => agent.type === AgentTypes.PRODUCT);

    const classification = await this.classificationUtil.classify({
      subject: 'Product agent preview test',
      fromEmail: customerEmail,
      body: dto.query,
    });

    const retrieval = await this.productKnowledgeService.retrieveForQuery({
      userId,
      query: dto.query,
      ...PRODUCT_RETRIEVAL_DEFAULTS,
      enableQueryExpansion: true,
    });

    const topSimilarity = retrieval.selectedChunks.length
      ? Math.max(...retrieval.selectedChunks.map((chunk) => chunk.similarity))
      : null;

    if (!productAgent?.isEnabled) {
      return this.blockedResponse('agent_disabled', user.email, customerEmail, customerName);
    }

    if (classification.category !== AgentTypes.PRODUCT) {
      return this.blockedResponse('non_product_intent', user.email, customerEmail, customerName);
    }

    if (classification.confidence < PRODUCT_CLASSIFICATION_CONFIDENCE_THRESHOLD) {
      return this.blockedResponse(
        'low_classification_confidence',
        user.email,
        customerEmail,
        customerName,
      );
    }

    if (classification.scenarios?.escalation) {
      return this.blockedResponse('escalation_scenario', user.email, customerEmail, customerName);
    }

    if (!retrieval.selectedChunks.length) {
      return this.blockedResponse('no_product_knowledge', user.email, customerEmail, customerName);
    }

    if (
      !this.hasSufficientSimilarity(
        dto.query,
        topSimilarity,
        retrieval.selectedChunks.length,
        retrieval.usedTokens,
      )
    ) {
      return this.blockedResponse('low_similarity', user.email, customerEmail, customerName);
    }

    const aiIdentity = await this.aiIdentityRepository.findByUserId(userId);
    const body = await this.generateProductKnowledgeResponse({
      customerQuery: dto.query,
      customerName,
      knowledgeChunks: retrieval.selectedChunks,
      aiIdentity,
    });

    return {
      from: user.email,
      to: customerEmail,
      subject: `Re: Product Inquiry - ${this.buildPreviewSubjectSuffix(dto.query)}`,
      body,
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
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(
      params.aiIdentity,
    );
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
      5. For recommendation questions, give a cautious recommendation only when supported by the retrieved knowledge.
      6. Do not include a salutation at the beginning (it is added automatically).
      7. Do not address the customer by name in the body.
      8. Do not include a signature/sign-off at the end.
      9. Keep it concise and useful (under 220 tokens).
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
    fromEmail: string,
    customerEmail: string,
    customerName: string,
  ): ProductPreviewResponse {
    const messageByReason: Record<ProductPreviewBlockReason, string> = {
      agent_disabled:
        'Our product assistant is currently unavailable. Please enable the Product Agent in settings and try again.',
      non_product_intent:
        "This question looks outside product support scope. Please share a product-specific question (compatibility, specs, usage, or recommendations).",
      low_classification_confidence:
        "I couldn't determine your product intent clearly. Please rephrase with product details like model, compatibility, or use-case.",
      escalation_scenario:
        'This request is better handled by a human support specialist. Please contact support for immediate assistance.',
      no_product_knowledge:
        "I couldn't find matching product information in the current knowledge base. Please add or update product knowledge and try again.",
      low_similarity:
        "I found limited matching product details. Please add model/spec details to your question so I can give a more accurate recommendation.",
    };

    const body = `Hi ${customerName},\n\n${messageByReason[reason]}`;
    return {
      from: fromEmail,
      to: customerEmail,
      subject: 'Re: Product Inquiry',
      body,
    };
  }

  private buildPreviewSubjectSuffix(question: string): string {
    const normalized = question.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'General Question';
    return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized;
  }

  private hasSufficientSimilarity(
    question: string,
    topSimilarity: number | null,
    chunkCount: number,
    usedTokens: number,
  ): boolean {
    if (topSimilarity === null) {
      return false;
    }

    if (topSimilarity >= PRODUCT_VERY_LOW_SIMILARITY_THRESHOLD) {
      return true;
    }

    if (topSimilarity < PRODUCT_RELAXED_SIMILARITY_THRESHOLD) {
      const recommendationQuery =
        /\b(do you recommend|would you recommend|is this good|is it good|worth it|best for)\b/i.test(
          question,
        );
      if (
        recommendationQuery &&
        topSimilarity >= PRODUCT_RECOMMENDATION_SIMILARITY_THRESHOLD &&
        usedTokens >= PRODUCT_MIN_TOKENS_FOR_RECOMMENDATION_SIMILARITY
      ) {
        return true;
      }
      return false;
    }

    return (
      chunkCount >= PRODUCT_MIN_CHUNKS_FOR_SIMILARITY_RELAXATION ||
      usedTokens >= PRODUCT_MIN_TOKENS_FOR_SIMILARITY_RELAXATION
    );
  }
}
