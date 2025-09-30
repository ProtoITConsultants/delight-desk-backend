import { Injectable } from '@nestjs/common';
import { ContactUsDto } from './dto/index.dto';
import { ContactUsRepository } from './contact-us.repository';
import { SendgridService } from '../sendgrid/sendgrid.service';

@Injectable()
export class ContactUsService {
  constructor(
    private readonly contactUsRepo: ContactUsRepository,
    private readonly sendgridService: SendgridService,
  ) {}

  async createInquiry(dto: ContactUsDto) {
    await Promise.all([
      this.contactUsRepo.create(dto),
      this.sendgridService.sendContactInquiryEmail(dto),
    ]);

    return { message: 'Inquiry received successfully' };
  }
}
