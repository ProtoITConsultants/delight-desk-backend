import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Brand voice presets supported by the AI agents. The message formatter maps each
 * preset to a specific phrasing style — see `MessageFormattingHelper`. The previous
 * 'custom' option (free-text override) was removed to keep tone behavior predictable.
 */
export const BRAND_VOICES = ['friendly', 'professional', 'sophisticated'] as const;
export type BrandVoice = (typeof BRAND_VOICES)[number];

export class CreateAiIdentityDto {
  @IsNotEmpty()
  @IsString()
  aiAgentName: string;

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
  @IsIn(BRAND_VOICES)
  brandVoice?: BrandVoice;

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
  @IsIn(BRAND_VOICES)
  brandVoice?: BrandVoice;

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

  aiAgentTitle?: string;

  emailSalutation: string;

  companyNameForEmailSignature?: string;

  signatureFooter?: string;

  // Voice & Settings Fields
  brandVoice?: BrandVoice;

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
