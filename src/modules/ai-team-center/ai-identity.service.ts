import { Injectable } from '@nestjs/common';
import { AiIdentityRepository } from '../../database/repos/ai-identity.repository';
import { CreateAiIdentityDto, GeneratedNameDto, UpdateAiIdentityDto } from './dto/ai-identity.dto';
import { AiIdentityEntity } from '../../database/schema';
import { OpenAIService } from '../openai/openai.service';

type AiIdentityUpdateData = Partial<
  Omit<AiIdentityEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
>;

@Injectable()
export class AiIdentityService {
  constructor(
    private readonly aiIdentityRepository: AiIdentityRepository,
    private readonly openaiService: OpenAIService,
  ) {}

  async getIdentity(userId: string): Promise<AiIdentityEntity | null> {
    return this.aiIdentityRepository.findByUserId(userId);
  }

  async createOrUpdateIdentity(
    userId: string,
    dto: CreateAiIdentityDto,
  ): Promise<AiIdentityEntity> {
    return this.aiIdentityRepository.upsert({
      userId,
      aiAgentName: dto.aiAgentName,
      businessType: dto.businessType || null,
      aiAgentTitle: dto.aiAgentTitle || null,
      emailSalutation: dto.emailSalutation,
      companyNameForEmailSignature: dto.companyNameForEmailSignature || null,
      signatureFooter: dto.signatureFooter || null,
      brandVoice: dto.brandVoice || 'professional',
      customBrandVoice: dto.customBrandVoice || null,
      industrySpecificGuidance: dto.industrySpecificGuidance ?? false,
      thankLoyalCustomers: dto.thankLoyalCustomers ?? false,
      allowEmojiInResponses: dto.allowEmojiInResponses ?? false,
      customInstructions: dto.customInstructions || null,
    });
  }

  async updateIdentity(userId: string, dto: UpdateAiIdentityDto): Promise<AiIdentityEntity> {
    const updateData: AiIdentityUpdateData = {};

    if (dto.aiAgentName !== undefined) updateData.aiAgentName = dto.aiAgentName;
    if (dto.businessType !== undefined) updateData.businessType = dto.businessType || null;
    if (dto.aiAgentTitle !== undefined) updateData.aiAgentTitle = dto.aiAgentTitle || null;
    if (dto.emailSalutation !== undefined) updateData.emailSalutation = dto.emailSalutation;
    if (dto.companyNameForEmailSignature !== undefined) {
      updateData.companyNameForEmailSignature = dto.companyNameForEmailSignature || null;
    }
    if (dto.signatureFooter !== undefined) updateData.signatureFooter = dto.signatureFooter || null;
    if (dto.brandVoice !== undefined) updateData.brandVoice = dto.brandVoice;
    if (dto.customBrandVoice !== undefined) {
      updateData.customBrandVoice = dto.customBrandVoice || null;
    }
    if (dto.industrySpecificGuidance !== undefined) {
      updateData.industrySpecificGuidance = dto.industrySpecificGuidance;
    }
    if (dto.thankLoyalCustomers !== undefined) {
      updateData.thankLoyalCustomers = dto.thankLoyalCustomers;
    }
    if (dto.allowEmojiInResponses !== undefined) {
      updateData.allowEmojiInResponses = dto.allowEmojiInResponses;
    }
    if (dto.customInstructions !== undefined) {
      updateData.customInstructions = dto.customInstructions || null;
    }

    const existing = await this.aiIdentityRepository.findByUserId(userId);

    if (existing) {
      return this.aiIdentityRepository.update(userId, updateData);
    }

    return this.aiIdentityRepository.create({
      userId,
      aiAgentName: updateData.aiAgentName ?? null,
      businessType: updateData.businessType ?? null,
      aiAgentTitle: updateData.aiAgentTitle ?? null,
      emailSalutation: updateData.emailSalutation ?? 'Hi',
      companyNameForEmailSignature: updateData.companyNameForEmailSignature ?? null,
      signatureFooter: updateData.signatureFooter ?? null,
      brandVoice: updateData.brandVoice ?? 'professional',
      customBrandVoice: updateData.customBrandVoice ?? null,
      industrySpecificGuidance: updateData.industrySpecificGuidance ?? false,
      thankLoyalCustomers: updateData.thankLoyalCustomers ?? false,
      allowEmojiInResponses: updateData.allowEmojiInResponses ?? false,
      customInstructions: updateData.customInstructions ?? null,
    });
  }

  async generateNames(customerDescription: string): Promise<GeneratedNameDto[]> {
    const prompt = `
      Based on the following business context, generate 5 suitable AI agent names with descriptions.

      Business Context: ${customerDescription}

      Generate names that are:
      1. Professional and friendly
      2. Easy to pronounce and remember
      3. Gender-neutral or diverse
      4. Suitable for customer service interactions

      Return your response in JSON format as an array of objects with "name" and "description" fields.
      Example format:
      [
        {
          "name": "Sarah",
          "description": "A friendly and professional AI assistant who excels at helping busy professionals with quick and efficient support"
        },
        {
          "name": "Alex",
          "description": "An approachable and knowledgeable AI agent specialized in e-commerce customer support"
        }
      ]
    `;

    const messages = [
      {
        role: 'system',
        content:
          'You are a creative AI assistant that generates suitable names for AI agents based on business context. Always respond with valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.openaiService.createChatCompletion(messages, 0.8);
    const content = response.choices[0].message.content || '[]';

    try {
      // Strip markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      const parsed = JSON.parse(cleanContent);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('Error parsing generated names:', error);
      // Return fallback names
      return [
        {
          name: 'Sarah',
          description: 'A friendly and professional AI assistant',
        },
        {
          name: 'Alex',
          description: 'An approachable and knowledgeable AI agent',
        },
        {
          name: 'Jordan',
          description: 'A reliable and efficient AI support specialist',
        },
      ];
    }
  }
}
