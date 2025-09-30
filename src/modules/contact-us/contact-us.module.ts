import { Module } from '@nestjs/common';
import { ContactUsService } from './contact-us.service';
import { ContactUsController } from './contact-us.controller';
import { DatabaseModule } from 'src/database/database.module';
import { ContactUsRepository } from './contact-us.repository';
import { SendgridService } from '../sendgrid/sendgrid.service';

@Module({
  imports: [DatabaseModule],
  providers: [ContactUsService, ContactUsRepository, SendgridService],
  controllers: [ContactUsController],
})
export class ContactUsModule {}
