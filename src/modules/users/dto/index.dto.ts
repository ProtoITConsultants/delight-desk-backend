import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Exclude, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'User first name', example: 'John' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ description: 'User last name', example: 'Doe' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({ description: 'User email address', example: 'john.doe@example.com' })
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'User password (minimum 6 characters)', example: 'SecurePass123', minLength: 6 })
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: 'Company name', example: 'Acme Corporation' })
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

export class GetUsersDto {
  @ApiPropertyOptional({ description: 'Search query to filter users by name or email', example: 'john' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Page number for pagination', example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Number of items per page', example: 10, minimum: 1, maximum: 100, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
