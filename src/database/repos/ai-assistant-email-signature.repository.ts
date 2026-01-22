import { eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from 'src/database/database.module';
import { aiAssistantEmailSignatures } from 'src/database/schema';

@Injectable()
export class AiAssistantEmailSignatureRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase) {}

  async findByUserId(userId: string) {
    const [signature] = await this.db
      .select()
      .from(aiAssistantEmailSignatures)
      .where(eq(aiAssistantEmailSignatures.userId, userId));
    return signature ?? null;
  }

  async createOrUpdateStructured(userId: string, data: any) {
    const existing = await this.findByUserId(userId);

    const updateData: any = {
      userId,
      signatureName: data.name,
      signatureTitle: data.title,
      signatureCompany: data.company,
      signatureCompanyUrl: data.companyUrl,
      signatureEmail: data.email,
      signaturePhoneNumber: data.phoneNumber,
      htmlSignature: null, // Clear HTML signature when updating structured
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await this.db
        .update(aiAssistantEmailSignatures)
        .set(updateData)
        .where(eq(aiAssistantEmailSignatures.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await this.db
        .insert(aiAssistantEmailSignatures)
        .values(updateData)
        .returning();
      return created;
    }
  }

  async createOrUpdateHtml(userId: string, htmlSignature: string) {
    const existing = await this.findByUserId(userId);

    const updateData: any = {
      userId,
      htmlSignature,
      // Clear structured fields when updating HTML signature
      signatureName: null,
      signatureTitle: null,
      signatureCompany: null,
      signatureCompanyUrl: null,
      signatureEmail: null,
      signaturePhoneNumber: null,
      updatedAt: new Date(),
    };

    if (existing) {
      const [updated] = await this.db
        .update(aiAssistantEmailSignatures)
        .set(updateData)
        .where(eq(aiAssistantEmailSignatures.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await this.db
        .insert(aiAssistantEmailSignatures)
        .values(updateData)
        .returning();
      return created;
    }
  }

  async delete(userId: string) {
    const [deleted] = await this.db
      .delete(aiAssistantEmailSignatures)
      .where(eq(aiAssistantEmailSignatures.userId, userId))
      .returning();
    return deleted ?? null;
  }
}
