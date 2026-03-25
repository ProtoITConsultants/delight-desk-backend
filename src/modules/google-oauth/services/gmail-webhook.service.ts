import { Injectable, Logger } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { GoogleOauthRepository } from 'src/database/repos/google-oauth.repository';
import { EmailEntity } from 'src/database/schema';
import { GmailParserUtil } from '../utils/gmail-parser.util';
import { EmailContentExtractorUtil } from '../utils/email-content-extractor.util';
import { EmailClassificationService } from './email-classification.service';
import { GMAIL_API, GMAIL_SENT_LABEL, IRRELEVANT_GMAIL_LABELS } from '../constants/gmail.constants';
import { InfraService } from '../../temporal/infra.service';

/**
 * Service for processing Gmail webhook notifications
 */
@Injectable()
export class GmailWebhookService {
  private readonly logger = new Logger(GmailWebhookService.name);
  private static readonly WAREHOUSE_WORKFLOW_MARKER_REGEX = /\[DD-(?:OC|AC)-WF:([^\]]+)\]/i;

  constructor(
    private readonly repo: GoogleOauthRepository,
    private readonly gmailParser: GmailParserUtil,
    private readonly contentExtractor: EmailContentExtractorUtil,
    private readonly emailClassifier: EmailClassificationService,
    private readonly infraService: InfraService,
  ) {}

  /**
   * Process new emails from Gmail webhook notification
   */
  async processNewEmails(
    gmail: gmail_v1.Gmail,
    email: string,
    newHistoryId: string | number,
  ): Promise<void> {
    const account = await this.repo.getGoogleAccountByEmail(email);
    if (!account) {
      return;
    }

    const startHistoryId = account.lastHistoryId ? account.lastHistoryId.toString() : null;

    // Fetch email history or perform initial sync
    const historyRes = await this.fetchEmailHistory(gmail, startHistoryId);
    if (!historyRes) {
      return;
    }

    const messages: any[] =
      historyRes?.data?.history?.flatMap((h: any) => h.messages) || historyRes?.messages || [];

    const latestHistoryId = historyRes?.data?.historyId || newHistoryId;

    // Process each message
    for (const msgRef of messages) {
      try {
        await this.processMessage(gmail, msgRef, account.userId);
      } catch (err: any) {
        console.error('Failed to process message ' + msgRef.id, err?.message || err);
      }
    }

    // Update last history ID
    await this.repo.updateGoogleAccount(account.userId, {
      lastHistoryId: latestHistoryId,
    });
  }

  /**
   * Fetch email history from Gmail
   */
  private async fetchEmailHistory(
    gmail: gmail_v1.Gmail,
    startHistoryId: string | null,
  ): Promise<any> {
    try {
      if (startHistoryId) {
        // Fetch incremental history
        return await gmail.users.history.list({
          userId: GMAIL_API.USER_ID,
          startHistoryId,
          historyTypes: [GMAIL_API.HISTORY_TYPE_MESSAGE_ADDED],
        });
      } else {
        // Initial sync - fetch latest message
        const listRes = await gmail.users.messages.list({
          userId: GMAIL_API.USER_ID,
          labelIds: ['INBOX'],
          maxResults: 1,
        });
        const msgIds = listRes.data.messages || [];
        return { fullSync: true, messages: msgIds.map((m: any) => ({ id: m.id })) };
      }
    } catch (err: any) {
      console.error('Failed to fetch email history:', err);
      return null;
    }
  }

  /**
   * Process a single email message
   */
  private async processMessage(gmail: gmail_v1.Gmail, msgRef: any, userId: string): Promise<void> {
    // Fetch full message details
    const messageDetails = await gmail.users.messages.get({
      userId: GMAIL_API.USER_ID,
      id: msgRef.id,
      format: GMAIL_API.FORMAT_RAW,
    });

    const msg = messageDetails.data;
    const gmailLabels = msg.labelIds || [];

    // Skip irrelevant emails (spam, promotions, etc.)
    if (this.hasIrrelevantLabel(gmailLabels)) {
      return;
    }

    // Parse message content
    const snippet = msg.snippet || null;
    const { text, html, headers } = await this.gmailParser.parseMessageBody(msg);

    const rawBody = text || html || snippet;
    const extractedBody = this.contentExtractor.extractNewContent(rawBody);
    const subject = headers?.['subject'] || null;
    const warehouseWorkflowId = this.extractWarehouseWorkflowId(subject, rawBody, extractedBody);
    const hasWarehouseWorkflowMarker = !!warehouseWorkflowId;
    const body =
      warehouseWorkflowId && !this.hasWarehouseWorkflowMarker(extractedBody)
        ? `${extractedBody || ''}\n\nReference: [DD-OC-WF:${warehouseWorkflowId}]`
        : extractedBody;

    // Filter out non-customer emails unless this is an explicit warehouse-routing reply.
    if (!hasWarehouseWorkflowMarker && !this.emailClassifier.isLikelyCustomerEmail(body)) {
      console.log('Skipping - not likely customer email:', msg.id);
      console.log('Skipped Email body:', body);
      return;
    }

    // Extract message metadata
    const messageId = msg.id;
    const threadId = msg.threadId as string;
    const from = this.contentExtractor.extractEmailAddress(headers?.['from']) || null;
    const to = this.contentExtractor.extractEmailAddress(headers?.['to']) || null;
    const cc = this.contentExtractor.extractEmailAddress(headers?.['cc']) || null;
    const internalDate = msg.internalDate ? new Date(Number(msg.internalDate)) : null;

    // Determine if email is incoming or outgoing
    const isIncomingEmail = gmailLabels[0] !== GMAIL_SENT_LABEL;

    // Upsert thread
    const { thread, isNew } = await this.repo.upsertThread(userId, threadId, subject);

    // When the owner sends the very first email in a thread, mark it as owner-initiated
    // so that customer replies are NOT routed through the AI pipeline.
    if (!isIncomingEmail && isNew) {
      await this.repo.updateThreadById(thread.id, { initiatedBy: 'owner' });
    }

    // Prepare email payload
    const emailPayload = {
      messageId: messageId,
      threadId: thread.id,
      userId: userId,
      fromEmail: from,
      toEmail: to,
      cc,
      snippet,
      subject,
      body,
      internalDate: internalDate as any,
      status: isIncomingEmail ? 'processing' : 'default_sent',
      direction: isIncomingEmail ? 'incoming' : 'outgoing',
    };

    // Insert email if it doesn't exist
    const { inserted, insertedEmail } = await this.repo.insertEmailIfNotExists(emailPayload);

    // Trigger email pipeline only for new incoming emails in customer-initiated threads.
    // Replies to threads the owner started manually are intentional direct conversations
    // and must not be handled by the AI agent.
    const isOwnerInitiated = thread.initiatedBy === 'owner';
    const shouldBypassOwnerInitiatedGuard = hasWarehouseWorkflowMarker;
    if (
      inserted &&
      insertedEmail &&
      isIncomingEmail &&
      (!isOwnerInitiated || shouldBypassOwnerInitiatedGuard)
    ) {
      console.log('Triggering email pipeline for:', insertedEmail.id);
      await this.triggerEmailPipeline(insertedEmail);
    } else {
      const reason = !isIncomingEmail
        ? 'outgoing'
        : shouldBypassOwnerInitiatedGuard
          ? 'warehouse-marker-reply'
          : isOwnerInitiated
            ? 'owner-initiated thread'
            : 'already exists';
      console.log(`Skipping pipeline (${reason}):`, messageId);
    }
  }

  /**
   * Check if email has irrelevant labels
   */
  private hasIrrelevantLabel(labels: string[]): boolean {
    return labels.some((label) => IRRELEVANT_GMAIL_LABELS.includes(label as any));
  }

  private hasWarehouseWorkflowMarker(body: string | null | undefined): boolean {
    return !!this.extractWarehouseWorkflowId(body);
  }

  private extractWarehouseWorkflowId(...parts: Array<string | null | undefined>): string | null {
    const searchable = parts.filter((part): part is string => !!part).join('\n');
    const match = searchable.match(GmailWebhookService.WAREHOUSE_WORKFLOW_MARKER_REGEX);
    return match?.[1]?.trim() || null;
  }

  /**
   * Trigger email processing pipeline
   */
  private async triggerEmailPipeline(email: EmailEntity): Promise<void> {
    setImmediate(async () => {
      try {
        await this.infraService.processEmail(email);
      } catch (error) {
        console.error(`Pipeline failed for email ${email.id}:`, error);
      }
    });
  }
}
