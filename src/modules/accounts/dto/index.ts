import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ description: 'User first name', example: 'John' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  firstName?: string;

  @ApiPropertyOptional({ description: 'User last name', example: 'Doe' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Company name', example: 'Acme Corporation' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  company?: string;

  @ApiPropertyOptional({ description: 'Phone number', example: '+1234567890', nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string | null;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current password', example: 'OldPass123' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({
    description: 'New password (minimum 12 characters)',
    example: 'NewPass123Secure',
    minLength: 12,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  newPassword: string;

  @ApiProperty({
    description: 'Confirm new password (must match new password)',
    example: 'NewPass123Secure',
    minLength: 12,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  confirmNewPassword: string;
}
