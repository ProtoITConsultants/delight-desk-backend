import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ProductKnowledgeService } from 'src/modules/ai-team-center/product-knowledge.service';
import { MessageFormattingHelper } from '../../shared/message-formatting.helper';
import { AgentsService } from 'src/modules/agents/agents.service';

@Injectable()
@Activity()
export class ProductActivities {
  constructor(
    private readonly productKnowledgeService: ProductKnowledgeService,
    private readonly agentsService: AgentsService,
    private readonly messageFormattingHelper: MessageFormattingHelper,
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
      5. Keep it concise and useful (under 220 tokens).
      6. Do not include a salutation at the beginning (it is added automatically).
      7. Do not address the customer by name in the body.
      8. Do not include a signature/sign-off at the end.
${voiceContext}
    `;

    const response = await this.agentsService['openaiService'].createChatCompletion(
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
}
