import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EscalationsRepository } from '../../database/repos/escalations.repository';
import { AiAssistantEmailSignatureRepository } from '../../database/repos/ai-assistant-email-signature.repository';
import { GoogleOauthService } from '../google-oauth/google-oauth.service';
import {
  BulkUpdateEscalationStatusDto,
  BulkUpdateResult,
  EmailSignatureResponse,
  EscalationListResponse,
  EscalationStatsResponse,
  GenerateAiResponseDto,
  GenerateAiResponseResponse,
  GetEscalationsDto,
  GetEscalationStatsDto,
  SendEscalationResponseDto,
  UpdateEscalationStatusDto,
  UpdateHtmlSignatureDto,
  UpdateStructuredSignatureDto,
} from './ai-assistant.dto';
import { extractEmail } from '../temporal/workflows/agents/wismo';
import { EmailThreadsRepository } from '../../database/repos/email-threads.repository';
import { OpenAIService } from '../openai/openai.service';

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly escalationsRepository: EscalationsRepository,
    private readonly emailSignatureRepository: AiAssistantEmailSignatureRepository,
    private readonly googleOauthService: GoogleOauthService,
    private readonly emailThreadsRepository: EmailThreadsRepository,
    private readonly openaiService: OpenAIService,
  ) {}

  async createEscalation(data: any) {
    return await this.escalationsRepository.createEscalation(data);
  }

  async getEscalations(userId: string, dto: GetEscalationsDto): Promise<EscalationListResponse> {
    const { page = 1, limit = 20, status, priority, sortBy, sortOrder, search } = dto;

    const offset = (page - 1) * limit;

    const filters = {
      userId,
      status,
      priority,
      search,
      sortBy,
      sortOrder,
      limit,
      offset,
    };

    const escalations = priority
      ? await this.escalationsRepository.getEscalationsWithFiltersPriority(filters)
      : await this.escalationsRepository.getEscalationsWithFilters(filters);

    const totalItems = await this.escalationsRepository.countEscalationsWithFilters(filters);

    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: escalations,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getEscalationById(userId: string, id: string) {
    const escalation = await this.escalationsRepository.findByIdWithDetails(id, userId);

    if (!escalation) {
      throw new NotFoundException('Escalation not found');
    }

    return escalation;
  }

  async updateStatus(userId: string, id: string, dto: UpdateEscalationStatusDto) {
    const existing = await this.escalationsRepository.findById(id);

    if (!existing) {
      throw new NotFoundException('Escalation not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('You do not have permission to update this escalation');
    }

    if (existing.status === dto.status) {
      return {
        id: existing.id,
        status: existing.status,
        resolvedAt: existing.resolvedAt,
        updatedBy: userId,
      };
    }

    const updateData: any = {
      status: dto.status,
      resolvedAt: new Date(),
    };

    const updated = await this.escalationsRepository.updateEscalation(id, userId, updateData);

    return {
      id: updated.id,
      status: updated.status,
      resolvedAt: updated.resolvedAt,
      updatedBy: userId,
    };
  }

  async bulkUpdateStatus(
    userId: string,
    dto: BulkUpdateEscalationStatusDto,
  ): Promise<BulkUpdateResult> {
    const { escalationIds, status, notes } = dto;

    const escalations = await Promise.all(
      escalationIds.map((id) => this.escalationsRepository.findById(id)),
    );

    const ownedEscalations = escalations.filter((esc) => esc && esc.userId === userId);

    if (ownedEscalations.length === 0) {
      throw new NotFoundException('None of the specified escalations were found');
    }

    if (ownedEscalations.length < escalationIds.length) {
      throw new ForbiddenException('You do not have permission to update some escalations');
    }

    const canUpdate = ownedEscalations.filter((esc) => esc.status === 'pending');
    const alreadyUpdated = ownedEscalations.filter((esc) => esc.status === status);

    const updated = await this.escalationsRepository.bulkUpdateStatus(
      canUpdate.map((e) => e.id),
      userId,
      status,
      notes,
    );

    return {
      success: true,
      updated: updated.length,
      results: updated.map((esc) => ({
        id: esc.id,
        status: esc.status,
        resolvedAt: esc.resolvedAt,
      })),
      skipped: alreadyUpdated.map((esc) => ({
        id: esc.id,
        reason: `Already ${esc.status}`,
      })),
    };
  }

  async getStats(userId: string, dto: GetEscalationStatsDto): Promise<EscalationStatsResponse> {
    const { dateFrom, dateTo } = dto;

    const stats = await this.escalationsRepository.getStats(userId, dateFrom, dateTo);

    const byStatus = {
      pending: 0,
      progress: 0,
      resolved: 0,
    };

    stats.byStatus.forEach((item: any) => {
      byStatus[item.status as keyof typeof byStatus] = item.count;
    });

    const byPriority = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0,
    };

    stats.byPriority.forEach((item: any) => {
      if (item.priority) {
        byPriority[item.priority as keyof typeof byPriority] = item.count;
      }
    });

    return {
      total: stats.total,
      byStatus,
      byPriority,
    };
  }

  // Email Signature Methods
  async getEmailSignature(userId: string): Promise<EmailSignatureResponse> {
    const signature = await this.emailSignatureRepository.findByUserId(userId);

    return {
      structured: {
        name: signature?.signatureName ?? null,
        title: signature?.signatureTitle ?? null,
        company: signature?.signatureCompany ?? null,
        companyUrl: signature?.signatureCompanyUrl ?? null,
        email: signature?.signatureEmail ?? null,
        phoneNumber: signature?.signaturePhoneNumber ?? null,
      },
      html: {
        htmlSignature: signature?.htmlSignature ?? null,
      },
    };
  }

  async updateStructuredSignature(
    userId: string,
    dto: UpdateStructuredSignatureDto,
  ): Promise<EmailSignatureResponse> {
    await this.emailSignatureRepository.createOrUpdateStructured(userId, dto);
    return this.getEmailSignature(userId);
  }

  async updateHtmlSignature(
    userId: string,
    dto: UpdateHtmlSignatureDto,
  ): Promise<EmailSignatureResponse> {
    await this.emailSignatureRepository.createOrUpdateHtml(userId, dto.htmlSignature);
    return this.getEmailSignature(userId);
  }

  // Send Response Method
  async sendEscalationResponse(
    userId: string,
    escalationId: string,
    dto: SendEscalationResponseDto,
  ): Promise<{ success: boolean; message: string }> {
    // Get escalation details
    const escalation = await this.escalationsRepository.findByIdWithDetails(escalationId, userId);

    if (!escalation) {
      throw new NotFoundException('Escalation not found');
    }

    if (escalation.userId !== userId) {
      throw new ForbiddenException('You do not have permission to respond to this escalation');
    }

    // Build the final message
    let finalMessage = dto.message;

    // Add email signature if requested
    if (dto.includeEmailSignature) {
      const signature = await this.emailSignatureRepository.findByUserId(userId);
      const emailSignature = this.generateEmailSignature(signature);

      if (emailSignature) {
        // Check if signature is HTML
        const isSignatureHtml = this.containsHtml(emailSignature);
        const isMessageHtml = this.containsHtml(dto.message);

        if (isSignatureHtml && !isMessageHtml) {
          // Convert plain text message to HTML and append HTML signature
          const messageHtml = dto.message.replace(/\n/g, '<br>');
          finalMessage = `${messageHtml}<br><br>${emailSignature}`;
        } else if (isSignatureHtml && isMessageHtml) {
          // Both are HTML, just concatenate
          finalMessage = `${dto.message}<br><br>${emailSignature}`;
        } else {
          // Plain text, use newlines
          finalMessage = `${dto.message}\n\n${emailSignature}`;
        }
      }
    }

    // @ts-ignore
    const emailThread = await this.emailThreadsRepository.findById(escalation.email.threadId);

    if (!emailThread) {
      // @ts-ignore
      throw new Error(`Email thread not found: ${escalation.email.threadId}`);
    }

    // Check if Gmail thread still exists before replying
    const threadExists = await this.googleOauthService.checkThreadExists(
      userId,
      emailThread.threadId,
    );

    // Send the email using Google OAuth service
    try {
      if (threadExists) {
        // Thread exists in Gmail, reply to it

        await this.googleOauthService.replyToGmailThread(
          userId,
          // @ts-ignore
          'developer@delightdesk.io' || extractEmail(escalation.email.fromEmail),
          // @ts-ignore
          `Re: ${escalation.email.subject}`,
          finalMessage,
          emailThread.threadId,
        );
      } else {
        // Thread was deleted from Gmail, send as standalone email
        await this.googleOauthService.sendStandaloneEmail(
          userId,
          // @ts-ignore
          'developer@delightdesk.io' || extractEmail(escalation.email.fromEmail),
          // @ts-ignore
          `Re: ${escalation.email.subject}`,
          finalMessage,
        );
      }
    } catch (e) {
      throw new BadRequestException('Please reconnect your business email for this action.');
    }

    return {
      success: true,
      message: 'Response sent successfully',
    };
  }

  // Generate AI Response with Custom Instructions
  async generateAiResponse(
    userId: string,
    escalationId: string,
    dto: GenerateAiResponseDto,
  ): Promise<GenerateAiResponseResponse> {
    // Get escalation details
    const escalation = await this.escalationsRepository.findByIdWithDetails(escalationId, userId);

    if (!escalation) {
      throw new NotFoundException('Escalation not found');
    }

    if (escalation.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this escalation');
    }

    // Extract email context
    // @ts-ignore
    const customerEmail = escalation.email?.from || 'the customer';
    // @ts-ignore
    const customerQuery = escalation.email?.body || escalation.email?.snippet || '';
    // @ts-ignore
    const subject = escalation.email?.subject || '';

    // Extract customer name from email
    const customerName = extractEmail(customerEmail)?.split('@')[0] || 'there';

    // Build prompt with context and user instruction
    const prompt = `
      You are a professional customer service representative writing a response to a customer inquiry.

      CONTEXT:
      - Customer: ${customerName}
      - Email Subject: ${subject}
      - Customer's Message: ${customerQuery}
      - Escalation Reason: ${escalation.reason}

      USER INSTRUCTION:
      ${dto.instruction}

      Generate a professional, empathetic customer service response that:
      1. Follows the user's instruction above
      2. Addresses the customer's concern appropriately
      3. Maintains a helpful and apologetic tone where needed
      4. Is concise and clear (under 200 words)
      5. Does NOT include a signature or sign-off (will be added separately)

      Return ONLY the response text, no additional formatting or explanations.
    `;

    const messages = [
      {
        role: 'system',
        content:
          'You are a professional customer service representative. Generate helpful, empathetic responses based on user instructions.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.7;

    const completion = await this.openaiService.createChatCompletion(messages, temperature);

    const response = completion.choices[0].message.content || '';

    return {
      response: response.trim(),
    };
  }

  private generateEmailSignature(signature: any): string | null {
    if (!signature) {
      return null;
    }

    // If HTML signature exists, use it
    if (signature.htmlSignature) {
      return signature.htmlSignature;
    }

    // Otherwise, generate from structured fields
    if (
      !signature.signatureName &&
      !signature.signatureTitle &&
      !signature.signatureCompany &&
      !signature.signatureEmail &&
      !signature.signaturePhoneNumber
    ) {
      return null;
    }

    const parts: string[] = [];

    if (signature.signatureName) {
      parts.push(signature.signatureName);
    }

    if (signature.signatureTitle) {
      parts.push(signature.signatureTitle);
    }

    if (signature.signatureCompany) {
      if (signature.signatureCompanyUrl) {
        parts.push(`${signature.signatureCompany} (${signature.signatureCompanyUrl})`);
      } else {
        parts.push(signature.signatureCompany);
      }
    }

    if (signature.signatureEmail) {
      parts.push(`Email: ${signature.signatureEmail}`);
    }

    if (signature.signaturePhoneNumber) {
      parts.push(`Phone: ${signature.signaturePhoneNumber}`);
    }

    return parts.join('\n');
  }

  private containsHtml(message: string): boolean {
    if (!message) return false;
    // Check for common HTML tags
    const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
    return htmlTagPattern.test(message);
  }
}
