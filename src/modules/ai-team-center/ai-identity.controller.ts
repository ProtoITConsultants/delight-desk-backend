import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AiIdentityService } from './ai-identity.service';
import {
  AiIdentityResponseDto,
  CreateAiIdentityDto,
  GeneratedNameDto,
  GenerateNamesDto,
  UpdateAiIdentityDto,
} from './dto/ai-identity.dto';
import { SessionGuard } from '../../guards/session.guard';
import { CurrentUserId } from '../../decorators/current-user.decorator';

@ApiTags('AI Team Center - Identity')
@ApiCookieAuth('connect.sid')
@UseGuards(SessionGuard)
@Controller('ai-team-center/identity')
export class AiIdentityController {
  constructor(private readonly aiIdentityService: AiIdentityService) {}

  @Get()
  @ApiOperation({
    summary: 'Get AI identity configuration',
    description:
      'Retrieve the complete AI identity settings for the authenticated user, including:\n' +
      '- **Identity**: Agent name, title, business type\n' +
      '- **Email Signature**: Salutation, company name, footer\n' +
      '- **Voice & Settings**: Brand voice (friendly/professional/sophisticated/custom), custom brand voice description, industry-specific guidance, loyal customer recognition, emoji preferences, and custom instructions\n\n' +
      'These settings control how the AI agent communicates with customers across all automated workflows.',
  })
  @ApiResponse({
    status: 200,
    description: 'AI identity configuration retrieved successfully',
    type: AiIdentityResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'AI identity not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getIdentity(@CurrentUserId() userId: string) {
    return this.aiIdentityService.getIdentity(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create or update AI identity configuration',
    description:
      'Create a new AI identity or update the complete configuration (upsert operation). ' +
      'This endpoint replaces all settings with the provided values.\n\n' +
      '**Configurable Settings:**\n' +
      '- **Identity Tab**: AI agent name (required), business type, agent title, email salutation\n' +
      '- **Email Signature**: Company name, signature footer\n' +
      '- **Voice & Settings Tab**: Brand voice tone, custom voice description (for "custom" voice), ' +
      'industry-specific guidance toggle, loyal customer recognition toggle, emoji preferences, custom AI instructions\n\n' +
      '**Brand Voice Options:**\n' +
      '- `friendly`: Warm, approachable, conversational tone\n' +
      '- `professional`: Polished, business-appropriate tone (default)\n' +
      '- `sophisticated`: Elevated, refined tone\n' +
      '- `custom`: Provide your own voice description in `customBrandVoice` field\n\n' +
      'All settings immediately affect how the AI communicates in WISMO and other workflows.',
  })
  @ApiBody({
    type: CreateAiIdentityDto,
    examples: {
      professional: {
        summary: 'Professional e-commerce setup',
        value: {
          aiAgentName: 'Sarah',
          businessType: 'E-commerce',
          aiAgentTitle: 'Customer Support Specialist',
          emailSalutation: 'Hi',
          companyNameForEmailSignature: 'Acme Corporation',
          signatureFooter: 'Need help? Visit support.acme.com or call 1-800-ACME',
          brandVoice: 'professional',
          industrySpecificGuidance: true,
          thankLoyalCustomers: true,
          allowEmojiInResponses: false,
          customInstructions: 'Always verify order status before making promises.',
        },
      },
      friendly: {
        summary: 'Friendly with emojis',
        value: {
          aiAgentName: 'Alex',
          aiAgentTitle: 'Support Specialist',
          emailSalutation: 'Hey',
          companyNameForEmailSignature: 'My Store',
          brandVoice: 'friendly',
          allowEmojiInResponses: true,
          thankLoyalCustomers: true,
        },
      },
      custom: {
        summary: 'Custom brand voice',
        value: {
          aiAgentName: 'Jordan',
          emailSalutation: 'Hello',
          brandVoice: 'custom',
          customBrandVoice:
            'We speak with empathy and authenticity. Our tone is warm yet professional, focusing on building trust.',
          customInstructions: 'Escalate immediately if customer mentions legal action.',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'AI identity created/updated successfully',
    type: AiIdentityResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async createOrUpdateIdentity(@CurrentUserId() userId: string, @Body() dto: CreateAiIdentityDto) {
    return this.aiIdentityService.createOrUpdateIdentity(userId, dto);
  }

  @Patch()
  @ApiOperation({
    summary: 'Partially update AI identity configuration',
    description:
      'Update specific fields of the AI identity configuration without affecting other fields. ' +
      'Only the fields provided in the request body will be updated.\n\n' +
      '**Use Cases:**\n' +
      '- Change just the brand voice without modifying agent name\n' +
      '- Toggle emoji preferences independently\n' +
      '- Update custom instructions while keeping other settings\n' +
      '- Modify email signature without changing voice settings\n\n' +
      '**Available Fields:**\n' +
      '- Identity: `aiAgentName`, `businessType`, `aiAgentTitle`, `emailSalutation`\n' +
      '- Signature: `companyNameForEmailSignature`, `signatureFooter`\n' +
      '- Voice & Settings: `brandVoice`, `customBrandVoice`, `industrySpecificGuidance`, ' +
      '`thankLoyalCustomers`, `allowEmojiInResponses`, `customInstructions`\n\n' +
      '**Note:** An AI identity must already exist for the user. Use POST endpoint to create initial configuration.',
  })
  @ApiBody({
    type: UpdateAiIdentityDto,
    examples: {
      changeVoice: {
        summary: 'Change brand voice only',
        value: {
          brandVoice: 'friendly',
        },
      },
      toggleSettings: {
        summary: 'Update voice settings',
        value: {
          allowEmojiInResponses: true,
          thankLoyalCustomers: true,
          industrySpecificGuidance: false,
        },
      },
      updateInstructions: {
        summary: 'Update custom instructions',
        value: {
          customInstructions:
            'Always offer alternatives when items are out of stock. Prioritize customer satisfaction.',
        },
      },
      switchToCustomVoice: {
        summary: 'Switch to custom brand voice',
        value: {
          brandVoice: 'custom',
          customBrandVoice:
            'We maintain a balance of professionalism and warmth in every interaction.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'AI identity updated successfully',
    type: AiIdentityResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'AI identity not found - Create one first using POST' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async updateIdentity(@CurrentUserId() userId: string, @Body() dto: UpdateAiIdentityDto) {
    return this.aiIdentityService.updateIdentity(userId, dto);
  }

  @Post('generate-names')
  @ApiOperation({
    summary: 'Generate AI agent name suggestions',
    description:
      'Use AI (powered by OpenAI) to generate creative and professional AI agent name suggestions ' +
      'based on your business description and customer context.\n\n' +
      '**How it works:**\n' +
      '1. Provide a description of your typical customers or business context\n' +
      '2. AI generates 5 suitable name suggestions with descriptions\n' +
      '3. Each suggestion includes the name and a persona description\n\n' +
      '**Example Input:**\n' +
      '```\n' +
      '"We serve busy professionals who need quick and reliable customer support for their online orders"\n' +
      '```\n\n' +
      '**Example Output:**\n' +
      '```json\n' +
      '[\n' +
      '  {\n' +
      '    "name": "Sarah",\n' +
      '    "description": "A friendly and professional AI assistant who excels at helping busy professionals"\n' +
      '  },\n' +
      '  ...\n' +
      ']\n' +
      '```\n\n' +
      'Use the generated names to configure your AI agent identity.',
  })
  @ApiBody({
    type: GenerateNamesDto,
    examples: {
      ecommerce: {
        summary: 'E-commerce business',
        value: {
          customerDescription:
            'We serve busy professionals who need quick and reliable customer support for their online orders',
        },
      },
      luxury: {
        summary: 'Luxury brand',
        value: {
          customerDescription:
            'We cater to high-end customers who expect exceptional, personalized service for premium products',
        },
      },
      saas: {
        summary: 'SaaS company',
        value: {
          customerDescription:
            'We support tech-savvy users who need efficient help with software onboarding and troubleshooting',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'AI agent names generated successfully',
    type: [GeneratedNameDto],
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Missing or invalid customer description',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async generateNames(@Body() dto: GenerateNamesDto) {
    return this.aiIdentityService.generateNames(dto.customerDescription);
  }
}
