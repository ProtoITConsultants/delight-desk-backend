import { Body, Controller, Post } from '@nestjs/common';

import { ContactUsService } from './contact-us.service';
import { ContactUsDto } from './dto/index.dto';

@Controller('contact')
export class ContactUsController {
  constructor(private readonly contactService: ContactUsService) {}

  @Post()
  async create(@Body() dto: ContactUsDto) {
    return this.contactService.createInquiry(dto);
  }
}
