import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({
    description: 'User first name',
    example: 'John',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({
    description: 'User email address (must be unique)',
    example: 'john.doe@example.com',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password (minimum 12 characters)',
    example: 'SecurePass123!',
    minLength: 12,
    type: String,
  })
  @IsNotEmpty()
  @MinLength(12)
  password: string;

  @ApiProperty({
    description: 'Company name',
    example: 'Acme Corporation',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  company: string;
}

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    type: String,
  })
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123!',
    minLength: 12,
    type: String,
  })
  @IsNotEmpty()
  @MinLength(12)
  password: string;
}

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email address to send password reset link',
    example: 'john.doe@example.com',
    type: String,
  })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    type: String,
  })
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New password (minimum 12 characters)',
    example: 'NewSecurePass123!',
    minLength: 12,
    type: String,
  })
  @IsNotEmpty()
  @MinLength(12)
  password: string;
}
