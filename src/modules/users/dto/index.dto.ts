import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Exclude } from 'class-transformer';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @IsString()
  company: string;
}

export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  phone?: string | null;
  isActive: boolean;
  lastLoginAt?: Date | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  signatureName?: string | null;
  signatureTitle?: string | null;
  signatureCompany?: string | null;
  signatureCompanyUrl?: string | null;
  signaturePhone?: string | null;
  signatureEmail?: string | null;
  signatureLogoUrl?: string | null;
  signaturePhotoUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;

  @Exclude()
  password: string;

  @Exclude()
  passwordResetToken?: string | null;

  @Exclude()
  passwordResetExpiresAt?: Date | null;
}
