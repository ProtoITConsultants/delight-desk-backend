import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateUserAgentDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresModeration?: boolean;
}

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsBoolean()
  hasTrackingPluginForWoocommerce?: boolean;
}
