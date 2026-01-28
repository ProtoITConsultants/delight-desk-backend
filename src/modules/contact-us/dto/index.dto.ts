// src/modules/contact/dto/create-contact.dto.ts
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContactUsDto {
  @ApiProperty({ description: 'Contact name', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Contact email address', example: 'john.doe@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ description: 'Inquiry subject', example: 'Question about pricing' })
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiProperty({ description: 'Inquiry message', example: 'I would like to know more about your enterprise plan...' })
  @IsString()
  @IsNotEmpty()
  inquiry: string;
}
