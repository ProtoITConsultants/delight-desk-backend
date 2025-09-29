import { Injectable } from '@nestjs/common';
import { ContactUsDto } from './dto/index.dto';
import { ContactUsRepository } from './contact-us.repository';

@Injectable()
export class ContactUsService {
  constructor(private readonly contactUsRepo: ContactUsRepository) {}

  async createInquiry(dto: ContactUsDto) {
    await this.contactUsRepo.create(dto);
    return { message: 'Inquiry received successfully' };
  }
}
