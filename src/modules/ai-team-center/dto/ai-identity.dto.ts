import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAiIdentityDto {
  @IsNotEmpty()
  @IsString()
  aiAgentName: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  aiAgentTitle?: string;

  @IsNotEmpty()
  @IsString()
  emailSalutation: string;

  @IsOptional()
  @IsString()
  companyNameForEmailSignature?: string;

  @IsOptional()
  @IsString()
  signatureFooter?: string;

  // Voice & Settings Fields
  @IsOptional()
  @IsIn(['friendly', 'professional', 'sophisticated', 'custom'])
  brandVoice?: 'friendly' | 'professional' | 'sophisticated' | 'custom';

  @IsOptional()
  @IsString()
  customBrandVoice?: string;

  @IsOptional()
  @IsBoolean()
  industrySpecificGuidance?: boolean;

  @IsOptional()
  @IsBoolean()
  thankLoyalCustomers?: boolean;

  @IsOptional()
  @IsBoolean()
  allowEmojiInResponses?: boolean;

  @IsOptional()
  @IsString()
  customInstructions?: string;
}

export class UpdateAiIdentityDto {
  @IsOptional()
  @IsString()
  aiAgentName?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  aiAgentTitle?: string;

  @IsOptional()
  @IsString()
  emailSalutation?: string;

  @IsOptional()
  @IsString()
  companyNameForEmailSignature?: string;

  @IsOptional()
  @IsString()
  signatureFooter?: string;

  // Voice & Settings Fields
  @IsOptional()
  @IsIn(['friendly', 'professional', 'sophisticated', 'custom'])
  brandVoice?: 'friendly' | 'professional' | 'sophisticated' | 'custom';

  @IsOptional()
  @IsString()
  customBrandVoice?: string;

  @IsOptional()
  @IsBoolean()
  industrySpecificGuidance?: boolean;

  @IsOptional()
  @IsBoolean()
  thankLoyalCustomers?: boolean;

  @IsOptional()
  @IsBoolean()
  allowEmojiInResponses?: boolean;

  @IsOptional()
  @IsString()
  customInstructions?: string;
}

export class GenerateNamesDto {
  @IsNotEmpty()
  @IsString()
  customerDescription: string;
}

export class AiIdentityResponseDto {
  id: string;

  userId: string;

  aiAgentName: string;

  businessType?: string;

  aiAgentTitle?: string;

  emailSalutation: string;

  companyNameForEmailSignature?: string;

  signatureFooter?: string;

  // Voice & Settings Fields
  brandVoice?: string;

  customBrandVoice?: string;

  industrySpecificGuidance: boolean;

  thankLoyalCustomers: boolean;

  allowEmojiInResponses: boolean;

  customInstructions?: string;

  createdAt: Date;

  updatedAt: Date;
}

export class GeneratedNameDto {
  name: string;

  description: string;
}
