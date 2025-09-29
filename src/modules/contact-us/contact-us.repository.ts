import { Inject, Injectable } from '@nestjs/common';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { contactInquiries } from '../../database/schema/contact_inquiry.schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ContactUsDto } from './dto/index.dto';

@Injectable()
export class ContactUsRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  create(dto: ContactUsDto) {
    return this.db.insert(contactInquiries).values({
      ...dto,
    });
  }
}
