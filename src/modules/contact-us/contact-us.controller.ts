import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContactUsService } from './contact-us.service';
import { ContactUsDto } from './dto/index.dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactUsController {
  constructor(private readonly contactService: ContactUsService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit contact inquiry',
    description: 'Submit a contact us inquiry or support request',
  })
  @ApiBody({ type: ContactUsDto })
  @ApiResponse({ status: 201, description: 'Inquiry submitted successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async create(@Body() dto: ContactUsDto) {
    return this.contactService.createInquiry(dto);
  }
}
