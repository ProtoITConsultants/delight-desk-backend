import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAiIdentityDto {
  @ApiProperty({
    description: 'Name of the AI agent',
    example: 'Sarah',
  })
  @IsNotEmpty()
  @IsString()
  aiAgentName: string;

  @ApiPropertyOptional({
    description: 'Type of business',
    example: 'E-commerce',
  })
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional({
    description: 'Title of the AI agent',
    example: 'Customer Support Specialist',
  })
  @IsOptional()
  @IsString()
  aiAgentTitle?: string;

  @ApiProperty({
    description: 'Email salutation to use',
    example: 'Hi',
    default: 'Hi',
  })
  @IsNotEmpty()
  @IsString()
  emailSalutation: string;

  @ApiPropertyOptional({
    description: 'Company name to display in email signature',
    example: 'Acme Corporation',
  })
  @IsOptional()
  @IsString()
  companyNameForEmailSignature?: string;

  @ApiPropertyOptional({
    description: 'Custom footer text for email signature',
    example: 'Need help? Visit support.acme.com or call 1-800-ACME',
  })
  @IsOptional()
  @IsString()
  signatureFooter?: string;

  // Voice & Settings Fields
  @ApiPropertyOptional({
    description: 'Brand voice tone for AI responses',
    example: 'professional',
    enum: ['friendly', 'professional', 'sophisticated', 'custom'],
    default: 'professional',
  })
  @IsOptional()
  @IsIn(['friendly', 'professional', 'sophisticated', 'custom'])
  brandVoice?: 'friendly' | 'professional' | 'sophisticated' | 'custom';

  @ApiPropertyOptional({
    description: 'Custom brand voice description (required when brandVoice is "custom")',
    example: 'We speak with a warm, empathetic tone while maintaining professionalism. We focus on building trust and reassuring customers.',
  })
  @IsOptional()
  @IsString()
  customBrandVoice?: string;

  @ApiPropertyOptional({
    description: 'Enable industry-specific guidance in AI responses',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  industrySpecificGuidance?: boolean;

  @ApiPropertyOptional({
    description: 'Thank loyal customers in responses',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  thankLoyalCustomers?: boolean;

  @ApiPropertyOptional({
    description: 'Allow emojis in AI responses',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allowEmojiInResponses?: boolean;

  @ApiPropertyOptional({
    description: 'Custom instructions for AI behavior and response guidelines',
    example: 'Always verify order status before making promises. Escalate immediately if customer mentions legal action.',
  })
  @IsOptional()
  @IsString()
  customInstructions?: string;
}

export class UpdateAiIdentityDto {
  @ApiPropertyOptional({
    description: 'Name of the AI agent',
    example: 'Sarah',
  })
  @IsOptional()
  @IsString()
  aiAgentName?: string;

  @ApiPropertyOptional({
    description: 'Type of business',
    example: 'E-commerce',
  })
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional({
    description: 'Title of the AI agent',
    example: 'Customer Support Specialist',
  })
  @IsOptional()
  @IsString()
  aiAgentTitle?: string;

  @ApiPropertyOptional({
    description: 'Email salutation to use',
    example: 'Hi',
  })
  @IsOptional()
  @IsString()
  emailSalutation?: string;

  @ApiPropertyOptional({
    description: 'Company name to display in email signature',
    example: 'Acme Corporation',
  })
  @IsOptional()
  @IsString()
  companyNameForEmailSignature?: string;

  @ApiPropertyOptional({
    description: 'Custom footer text for email signature',
    example: 'Need help? Visit support.acme.com or call 1-800-ACME',
  })
  @IsOptional()
  @IsString()
  signatureFooter?: string;

  // Voice & Settings Fields
  @ApiPropertyOptional({
    description: 'Brand voice tone for AI responses',
    example: 'professional',
    enum: ['friendly', 'professional', 'sophisticated', 'custom'],
  })
  @IsOptional()
  @IsIn(['friendly', 'professional', 'sophisticated', 'custom'])
  brandVoice?: 'friendly' | 'professional' | 'sophisticated' | 'custom';

  @ApiPropertyOptional({
    description: 'Custom brand voice description (required when brandVoice is "custom")',
    example: 'We speak with a warm, empathetic tone while maintaining professionalism. We focus on building trust and reassuring customers.',
  })
  @IsOptional()
  @IsString()
  customBrandVoice?: string;

  @ApiPropertyOptional({
    description: 'Enable industry-specific guidance in AI responses',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  industrySpecificGuidance?: boolean;

  @ApiPropertyOptional({
    description: 'Thank loyal customers in responses',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  thankLoyalCustomers?: boolean;

  @ApiPropertyOptional({
    description: 'Allow emojis in AI responses',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  allowEmojiInResponses?: boolean;

  @ApiPropertyOptional({
    description: 'Custom instructions for AI behavior and response guidelines',
    example: 'Always verify order status before making promises. Escalate immediately if customer mentions legal action.',
  })
  @IsOptional()
  @IsString()
  customInstructions?: string;
}

export class GenerateNamesDto {
  @ApiProperty({
    description: 'Description of typical customers or business context',
    example: 'We serve busy professionals who need quick and reliable customer support for their online orders',
  })
  @IsNotEmpty()
  @IsString()
  customerDescription: string;
}

export class AiIdentityResponseDto {
  @ApiProperty({ description: 'AI Identity ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Name of the AI agent' })
  aiAgentName: string;

  @ApiPropertyOptional({ description: 'Type of business' })
  businessType?: string;

  @ApiPropertyOptional({ description: 'Title of the AI agent' })
  aiAgentTitle?: string;

  @ApiProperty({ description: 'Email salutation to use' })
  emailSalutation: string;

  @ApiPropertyOptional({ description: 'Company name for email signature' })
  companyNameForEmailSignature?: string;

  @ApiPropertyOptional({ description: 'Custom footer text for email signature' })
  signatureFooter?: string;

  // Voice & Settings Fields
  @ApiPropertyOptional({ description: 'Brand voice tone for AI responses' })
  brandVoice?: string;

  @ApiPropertyOptional({ description: 'Custom brand voice description' })
  customBrandVoice?: string;

  @ApiProperty({ description: 'Enable industry-specific guidance' })
  industrySpecificGuidance: boolean;

  @ApiProperty({ description: 'Thank loyal customers in responses' })
  thankLoyalCustomers: boolean;

  @ApiProperty({ description: 'Allow emojis in AI responses' })
  allowEmojiInResponses: boolean;

  @ApiPropertyOptional({ description: 'Custom instructions for AI behavior' })
  customInstructions?: string;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}

export class GeneratedNameDto {
  @ApiProperty({ description: 'Generated AI agent name', example: 'Sarah' })
  name: string;

  @ApiProperty({
    description: 'Description of the persona',
    example: 'A friendly and professional AI assistant who excels at helping busy professionals',
  })
  description: string;
}
