import { Injectable, Logger } from '@nestjs/common';
import { MicrosoftOauthRepository } from 'src/database/repos/microsoft-oauth.repository';
import { GoogleOauthRepository } from 'src/database/repos/google-oauth.repository';
import { EmailClassificationService } from 'src/modules/google-oauth/services/email-classification.service';
import { EmailContentExtractorUtil } from 'src/modules/google-oauth/utils/email-content-extractor.util';
import { InfraService } from 'src/modules/temporal/infra.service';
import { MicrosoftOauthService } from '../microsoft-oauth.service';

/**
 * Service for processing Microsoft Graph webhook notifications for incoming Outlook emails.
 * Mirrors the behaviour of GmailWebhookService for the Microsoft provider.
 */
@Injectable()
export class OutlookWebhookService {
  private readonly logger = new Logger(OutlookWebhookService.name);
  private static readonly WAREHOUSE_WORKFLOW_MARKER_REGEX = /\[DD-(?:OC|AC)-WF:([^\]]+)\]/i;

  constructor(
    private readonly microsoftRepo: MicrosoftOauthRepository,
    private readonly googleRepo: GoogleOauthRepository,
    private readonly microsoftOauthService: MicrosoftOauthService,
    private readonly emailClassifier: EmailClassificationService,
    private readonly contentExtractor: EmailContentExtractorUtil,
    private readonly infraService: InfraService,
  ) {}

  /**
   * Entry point called by the controller for every notification in body.value[].
   */
  async processNotification(subscriptionId: string, messageId: string): Promise<void> {
    const account = await this.microsoftRepo.getMicrosoftAccountBySubscriptionId(subscriptionId);

    if (!account) {
      this.logger.warn(`No Microsoft account found for subscriptionId: ${subscriptionId}`);
      return;
    }

    try {
      await this.processMessage(account.userId, account.email, messageId);
    } catch (err: any) {
      this.logger.error(
        `Failed to process Outlook message ${messageId} for user ${account.userId}: ${err?.message}`,
      );
    }
  }

  private async processMessage(
    userId: string,
    accountEmail: string,
    messageId: string,
  ): Promise<void> {
    const client = await this.microsoftOauthService.getGraphClientForUser(userId);

    let message: any;
    try {
      message = await client
        .api(`/me/messages/${messageId}`)
        .select(
          'id,subject,from,toRecipients,ccRecipients,body,conversationId,receivedDateTime,isRead,isDraft',
        )
        .get();
    } catch (err: any) {
      // 404 / "object not found" means the message was deleted or moved before
      // we could fetch it (e.g. the user cleared their inbox). Skip silently.
      const status: number = err?.statusCode ?? err?.code ?? 0;
      const isNotFound =
        status === 404 ||
        err?.message?.includes('not found') ||
        err?.message?.includes('ErrorItemNotFound');
      if (isNotFound) {
        this.logger.debug(`Outlook message ${messageId} no longer exists — skipping`);
        return;
      }
      throw err;
    }

    // Skip drafts
    if (message.isDraft) {
      return;
    }

    const fromAddress: string = message.from?.emailAddress?.address || '';
    const subject: string | null = message.subject || null;
    const conversationId: string = message.conversationId;
    const isIncoming = fromAddress.toLowerCase() !== accountEmail.toLowerCase();

    const toAddress: string = message.toRecipients?.[0]?.emailAddress?.address || accountEmail;
    const ccAddress: string | null = message.ccRecipients?.[0]?.emailAddress?.address || null;

    // Extract plain-text body (Graph returns HTML by default; prefer text)
    const rawBody =
      message.body?.contentType === 'text'
        ? message.body?.content
        : this.contentExtractor.stripHtmlTags(message.body?.content || '');

    const extractedBody = this.contentExtractor.extractNewContent(rawBody) || rawBody || '';
    const warehouseWorkflowId = this.extractWarehouseWorkflowId(subject, rawBody, extractedBody);
    const hasWarehouseWorkflowMarker = !!warehouseWorkflowId;
    const body =
      warehouseWorkflowId && !this.hasWarehouseWorkflowMarker(subject, extractedBody)
        ? `${extractedBody || ''}\n\nReference: [DD-OC-WF:${warehouseWorkflowId}]`
        : extractedBody;

    // Upsert thread using conversationId as the provider-native thread identifier.
    // If this is the very first message in the thread AND it was sent by the
    // account owner, mark it as 'owner' so customer replies later are NOT
    // routed through the AI pipeline.
    const { thread, isNew } = await this.googleRepo.upsertThreadWithProvider(
      userId,
      conversationId,
      subject,
      'microsoft',
    );
    if (!isIncoming && isNew) {
      await this.googleRepo.updateThreadById(thread.id, { initiatedBy: 'owner' });
    }

    // For INCOMING messages we apply the customer-email classifier filter;
    // OUTGOING owner messages are always persisted so the AI Assistant
    // thread-history view can render the agent's own replies.
    if (
      isIncoming &&
      !hasWarehouseWorkflowMarker &&
      !this.emailClassifier.isLikelyCustomerEmail(body)
    ) {
      this.logger.log(`Skipping Outlook message ${messageId} — not a customer email`);
      return;
    }

    const internalDate = message.receivedDateTime ? new Date(message.receivedDateTime) : null;

    const emailPayload = {
      messageId,
      threadId: thread.id,
      userId,
      fromEmail: fromAddress,
      toEmail: toAddress,
      cc: ccAddress,
      subject,
      snippet: body.slice(0, 200),
      body,
      internalDate,
      direction: (isIncoming ? 'incoming' : 'outgoing') as 'incoming' | 'outgoing',
    };

    const { inserted, insertedEmail } = await this.googleRepo.insertEmailIfNotExists(emailPayload);

    // Trigger AI pipeline only for new INCOMING customer-initiated emails.
    // Owner-sent (outgoing) messages and replies in owner-initiated threads
    // must never be processed by the AI agent.
    const isOwnerInitiated = thread.initiatedBy === 'owner';
    const shouldBypassOwnerInitiatedGuard = hasWarehouseWorkflowMarker;

    if (
      inserted &&
      insertedEmail &&
      isIncoming &&
      (!isOwnerInitiated || shouldBypassOwnerInitiatedGuard)
    ) {
      this.logger.log(`Triggering pipeline for Outlook message: ${messageId}`);
      this.triggerEmailPipeline(insertedEmail);
    } else {
      const reason = !isIncoming
        ? 'outgoing'
        : shouldBypassOwnerInitiatedGuard
          ? 'warehouse-marker-reply'
          : isOwnerInitiated
            ? 'owner-initiated thread'
            : 'already exists';
      this.logger.log(`Skipping pipeline for Outlook message ${messageId} (${reason})`);
    }
  }

  private triggerEmailPipeline(email: any): void {
    setImmediate(async () => {
      try {
        await this.infraService.processEmail(email);
      } catch (error) {
        this.logger.error(`Pipeline failed for Outlook email ${email.id}:`, error);
      }
    });
  }

  private hasWarehouseWorkflowMarker(
    subject: string | null | undefined,
    body: string | null | undefined,
  ): boolean {
    return !!this.extractWarehouseWorkflowId(subject, body);
  }

  private extractWarehouseWorkflowId(...parts: Array<string | null | undefined>): string | null {
    const searchable = parts.filter((part): part is string => !!part).join('\n');
    const match = searchable.match(OutlookWebhookService.WAREHOUSE_WORKFLOW_MARKER_REGEX);
    return match?.[1]?.trim() || null;
  }
}
