import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  MessageEvent,
  NotFoundException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { EscalationsRepository } from '../../database/repos/escalations.repository';
import { AiAssistantEmailSignatureRepository } from '../../database/repos/ai-assistant-email-signature.repository';
import { GoogleOauthService } from '../google-oauth/google-oauth.service';
import { MicrosoftOauthService } from '../microsoft-oauth/microsoft-oauth.service';
import { AiAssistantEventsService } from './ai-assistant-events.service';
import {
  BulkUpdateEscalationStatusDto,
  BulkUpdateResult,
  EmailSignatureResponse,
  EscalationListResponse,
  EscalationListWithThreadResponse,
  EscalationStatsResponse,
  EscalationThreadMessage,
  EscalationWithThreadItem,
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
import { EmailsRepository } from '../../database/repos/emails.repository';
import { OpenAIService } from '../openai/openai.service';

@Injectable()
export class AiAssistantService {
  /**
   * In-flight `sendEscalationResponse` calls keyed by `escalationId`.
   *
   * Prevents a single escalation from being replied to twice
   * concurrently — protects against frontend double-clicks, network
   * retries, and replies from multiple open tabs. The frontend should
   * still disable the button while a request is in flight for UX, but
   * this is the authoritative guard.
   *
   * In-memory is sufficient because we run on a single backend instance
   * (same assumption the SSE event bus already makes). If we ever go
   * multi-instance this would need to move to Redis / a DB flag.
   */
  private readonly inFlightEscalationSends = new Set<string>();

  constructor(
    private readonly escalationsRepository: EscalationsRepository,
    private readonly emailSignatureRepository: AiAssistantEmailSignatureRepository,
    private readonly googleOauthService: GoogleOauthService,
    private readonly microsoftOauthService: MicrosoftOauthService,
    private readonly emailThreadsRepository: EmailThreadsRepository,
    private readonly emailsRepository: EmailsRepository,
    private readonly openaiService: OpenAIService,
    private readonly eventsService: AiAssistantEventsService,
  ) {}

  /**
   * Subscribe a user to the AI Assistant SSE feed. Used by the
   * `@Sse('stream')` controller endpoint. Same delegation pattern as
   * `ApprovalQueueService.streamQueueUpdates`.
   */
  streamEscalationUpdates(userId: string): Observable<MessageEvent> {
    return this.eventsService.subscribe(userId);
  }

  getStreamStats() {
    return this.eventsService.getStreamStats();
  }

  async createEscalation(data: any) {
    const created = await this.escalationsRepository.createEscalation(data);
    // Notify any open AI Assistant tabs for this user that the list
    // changed so they can refetch the escalations-with-thread feed.
    this.eventsService.emitEscalationsUpdated(data?.userId, 'escalation_created');
    return created;
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

  /**
   * Paginated list of escalations enriched with the FULL email thread for
   * each item. Same query params, same pagination envelope, and same
   * filter/sort semantics as `getEscalations` — this is intended as a
   * drop-in "v2" the frontend can call when it needs to render the
   * Gmail-style conversation per escalation.
   *
   * Implementation note: thread metadata and messages are fetched in
   * exactly TWO additional batched queries (regardless of page size),
   * so this remains O(1) round-trips — not N+1.
   */
  async getEscalationsWithThread(
    userId: string,
    dto: GetEscalationsDto,
  ): Promise<EscalationListWithThreadResponse> {
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

    // Collect every internal thread id referenced by the page so we can
    // batch-fetch threads + messages in one round-trip each.
    const threadIds = Array.from(
      new Set(escalations.map((e) => e.threadId).filter((id): id is string => !!id)),
    );

    const [threads, messages] = await Promise.all([
      this.emailThreadsRepository.findByIds(threadIds),
      this.emailsRepository.findAllByThreadIds(threadIds, userId),
    ]);

    // Index by threadId for O(1) lookups while assembling the response.
    const threadById = new Map(threads.map((t) => [t.id, t]));
    const messagesByThreadId = new Map<string, EscalationThreadMessage[]>();
    for (const m of messages) {
      const list = messagesByThreadId.get(m.threadId) ?? [];
      list.push({
        id: m.id,
        messageId: m.messageId,
        threadId: m.threadId,
        fromEmail: m.fromEmail,
        toEmail: m.toEmail,
        cc: m.cc ?? null,
        bcc: m.bcc ?? null,
        subject: m.subject ?? null,
        snippet: m.snippet ?? null,
        body: m.body,
        internalDate: m.internalDate ?? null,
        direction: (m.direction as 'incoming' | 'outgoing' | null) ?? null,
        createdAt: m.createdAt,
      });
      messagesByThreadId.set(m.threadId, list);
    }

    const data: EscalationWithThreadItem[] = escalations.map((escalation) => {
      const thread = escalation.threadId ? threadById.get(escalation.threadId) : undefined;
      const items = escalation.threadId ? (messagesByThreadId.get(escalation.threadId) ?? []) : [];

      return {
        id: escalation.id,
        workflowId: escalation.workflowId,
        threadId: escalation.threadId,
        userId: escalation.userId,
        status: escalation.status,
        reason: escalation.reason,
        email: escalation.email,
        aiSuggestedResponse: escalation.aiSuggestedResponse ?? null,
        aiSuggestedResponseConfidence: escalation.aiSuggestedResponseConfidence ?? null,
        priority: escalation.priority ?? null,
        createdAt: escalation.createdAt,
        resolvedAt: escalation.resolvedAt ?? null,
        thread: thread
          ? {
              id: thread.id,
              threadId: thread.threadId,
              subject: thread.subject ?? null,
              provider: thread.provider ?? null,
              initiatedBy: thread.initiatedBy ?? null,
              createdAt: thread.createdAt,
              updatedAt: thread.updatedAt,
            }
          : null,
        messages: items,
        messagesCount: items.length,
      };
    });

    return {
      data,
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

    this.eventsService.emitEscalationsUpdated(userId, 'escalation_status_updated');

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

    const alreadyUpdated = ownedEscalations.filter((esc) => esc.status === status);

    const updated = await this.escalationsRepository.bulkUpdateStatus(
      ownedEscalations.map((e) => e.id),
      userId,
      status,
    );

    if (updated.length > 0) {
      this.eventsService.emitEscalationsUpdated(userId, 'escalations_bulk_status_updated');
    }

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
    // Acquire the in-flight lock for this escalation BEFORE any work so
    // concurrent requests (double-click, network retry, multiple tabs)
    // fail fast with 409 Conflict instead of sending two emails.
    if (this.inFlightEscalationSends.has(escalationId)) {
      throw new ConflictException(
        'A response is already being sent for this escalation. Please wait.',
      );
    }
    this.inFlightEscalationSends.add(escalationId);

    try {
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

      // escalation.email.threadId points to email_threads.id (internal UUID).
      // The thread row tells us which provider (Gmail vs Outlook) the
      // conversation lives on so we can route the reply correctly.
      // @ts-ignore - escalation.email is jsonb
      const internalThreadId: string | undefined = escalation.email?.threadId;

      if (!internalThreadId) {
        throw new Error('Escalation has no associated email thread');
      }

      const emailThread = await this.emailThreadsRepository.findById(internalThreadId);

      if (!emailThread) {
        throw new Error(`Email thread not found: ${internalThreadId}`);
      }

      // Resolve the customer's email address (the original sender of the
      // escalated email) and the reply subject. `escalation.email` is a
      // joined `emails` row whose exact shape we cast through `any` because
      // downstream helpers accept slightly looser types than the drizzle
      // inferred type.
      const escalatedEmail = escalation.email as any;
      const rawFromEmail: string | null | undefined = escalatedEmail?.fromEmail;
      const recipientEmail =
        (rawFromEmail ? extractEmail(rawFromEmail) : null) || rawFromEmail || null;

      // Avoid stacking "Re: Re: Re:" prefixes when the original subject is
      // already itself a reply. Treat any leading "Re:" (case-insensitive,
      // optional whitespace) as already prefixed.
      const originalSubject: string = (escalatedEmail?.subject as string | null | undefined) ?? '';
      const replySubject = /^\s*re\s*:/i.test(originalSubject)
        ? originalSubject
        : `Re: ${originalSubject}`;

      if (!recipientEmail) {
        throw new BadRequestException('Could not determine the customer email to reply to.');
      }

      const isMicrosoft = emailThread.provider === 'microsoft';

      try {
        if (isMicrosoft) {
          // Outlook: try replying to the conversation. If it no longer exists,
          // fall back to a standalone send so the agent can still reach the
          // customer.
          const conversationExists = await this.microsoftOauthService.checkConversationExists(
            userId,
            emailThread.threadId,
          );

          if (conversationExists) {
            // Pass the most recent provider-native message ID we have stored
            // for this thread to avoid Graph's InefficientFilter error.
            const lastMessageId =
              await this.emailThreadsRepository.findLatestMessageIdByInternalThreadId(
                emailThread.id,
              );
            await this.microsoftOauthService.replyToOutlookThread(
              userId,
              emailThread.threadId,
              finalMessage,
              lastMessageId ?? undefined,
            );
          } else {
            await this.microsoftOauthService.sendEmail(userId, {
              to: recipientEmail,
              subject: replySubject,
              body: finalMessage,
            });
          }
        } else {
          // Gmail (default for legacy threads where provider may be null too)
          const threadExists = await this.googleOauthService.checkThreadExists(
            userId,
            emailThread.threadId,
          );

          if (threadExists) {
            await this.googleOauthService.replyToGmailThread(
              userId,
              recipientEmail,
              replySubject,
              finalMessage,
              emailThread.threadId,
            );
          } else {
            await this.googleOauthService.sendStandaloneEmail(
              userId,
              recipientEmail,
              replySubject,
              finalMessage,
            );
          }
        }
      } catch (e) {
        throw new BadRequestException('Please reconnect your business email for this action.');
      }

      // Immediate feedback for the sender's open tab. The provider webhook
      // (Gmail history / Outlook subscription) will also emit when the sent
      // message echoes back into our DB, but that has provider-side latency
      // — emitting here keeps the UI snappy and the second event becomes a
      // harmless no-op refetch.
      this.eventsService.emitEscalationsUpdated(userId, 'escalation_response_sent');

      return {
        success: true,
        message: 'Response sent successfully',
      };
    } finally {
      // Always release the lock — on success, on validation failure, on
      // provider send failure, on unexpected error. Without this, a single
      // failed send would block all future replies for that escalation.
      this.inFlightEscalationSends.delete(escalationId);
    }
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
