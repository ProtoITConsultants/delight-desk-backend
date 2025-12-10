import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ContactUsDto } from 'src/modules/contact-us/dto/index.dto';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { contactInquiries } from '../../database/schema/contact_inquiry.schema';

@Injectable()
export class ContactUsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  create(dto: ContactUsDto) {
    return this.db.insert(contactInquiries).values({
      ...dto,
    });
  }
}
