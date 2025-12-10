import { Injectable } from '@nestjs/common';
import { ContactUsDto } from './dto/index.dto';
import { SendgridService } from '../sendgrid/sendgrid.service';
import { ContactUsRepository } from 'src/database/repos/contact-us.repository';

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
