import { Injectable, Logger } from '@nestjs/common';
import { GoogleOauthService } from 'src/modules/google-oauth/google-oauth.service';
import { MicrosoftOauthService } from 'src/modules/microsoft-oauth/microsoft-oauth.service';
import { EmailThreadsRepository } from 'src/database/repos/email-threads.repository';
import { GoogleOauthRepository } from 'src/database/repos/google-oauth.repository';

/**
 * Provider-agnostic adapter for all outbound email operations executed during
 * Temporal workflow activities.  It inspects the `provider` column of the
 * email_thread record (set at ingestion time) and delegates to either
 * GoogleOauthService (Gmail) or MicrosoftOauthService (Outlook / Graph API).
 */
@Injectable()
export class EmailProviderAdapter {
  private readonly logger = new Logger(EmailProviderAdapter.name);

  constructor(
    private readonly googleOauthService: GoogleOauthService,
    private readonly microsoftOauthService: MicrosoftOauthService,
    private readonly emailThreadsRepository: EmailThreadsRepository,
    private readonly googleOauthRepository: GoogleOauthRepository,
  ) {}

  /**
   * Send a reply within an existing email thread.
   * Routes to Gmail's `replyToGmailThread` or Outlook's `replyToOutlookThread`
   * depending on which provider originated the thread.
   */
  async replyToThread(
    userId: string,
    to: string,
    subject: string,
    message: string,
    threadId: string,
  ): Promise<any> {
    const thread = await this.emailThreadsRepository.findById(threadId);

    if (!thread) {
      throw new Error(`Email thread not found: ${threadId}`);
    }

    if (thread.provider === 'microsoft') {
      this.logger.log(`Replying via Outlook to conversation ${thread.threadId}`);
      // Look up the stored Graph message ID so we can reply directly and avoid an
      // unreliable $filter query that triggers InefficientFilter (Graph 400).
      const lastMessageId =
        await this.emailThreadsRepository.findLatestMessageIdByInternalThreadId(threadId);
      return this.microsoftOauthService.replyToOutlookThread(
        userId,
        thread.threadId,
        message,
        lastMessageId ?? undefined,
      );
    }

    this.logger.log(`Replying via Gmail to thread ${thread.threadId}`);
    return this.googleOauthService.replyToGmailThread(userId, to, subject, message, thread.threadId);
  }

  /**
   * Poll the thread for a new customer reply since `lastCheckedMessageId`.
   */
  async checkForCustomerReplyInThread(
    userId: string,
    threadId: string,
    lastCheckedMessageId: string,
  ): Promise<{ hasNewReply: boolean; newEmail?: any }> {
    const thread = await this.emailThreadsRepository.findById(threadId);

    if (!thread) {
      throw new Error(`Email thread not found: ${threadId}`);
    }

    if (thread.provider === 'microsoft') {
      return this.microsoftOauthService.checkForCustomerReplyInOutlookThread(
        userId,
        thread.threadId,
        lastCheckedMessageId,
      );
    }

    // Gmail path — fetch thread messages directly via the Gmail API
    const gmail = await this.googleOauthService.getGmailClient(userId);
    const gmailThread = await gmail.users.threads.get({
      userId: 'me',
      id: thread.threadId,
    });

    const messages = gmailThread.data.messages || [];

    const lastCheckedIndex = messages.findIndex(
      (msg: any) =>
        msg.id === lastCheckedMessageId ||
        msg.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'message-id')?.value ===
          lastCheckedMessageId,
    );

    if (lastCheckedIndex === -1 || lastCheckedIndex === messages.length - 1) {
      return { hasNewReply: false };
    }

    const latestMessage = messages[messages.length - 1];
    const headers = latestMessage.payload?.headers || [];

    const fromHeader = headers.find((h: any) => h.name === 'From')?.value || '';
    const subjectHeader = headers.find((h: any) => h.name === 'Subject')?.value || '';

    let body = '';
    if (latestMessage.payload?.body?.data) {
      body = Buffer.from(latestMessage.payload.body.data, 'base64').toString('utf-8');
    } else if (latestMessage.payload?.parts) {
      const textPart = latestMessage.payload.parts.find(
        (part: any) => part.mimeType === 'text/plain',
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    return {
      hasNewReply: true,
      newEmail: {
        messageId: latestMessage.id,
        from: fromHeader,
        subject: subjectHeader,
        body,
      },
    };
  }

  /**
   * Mark an email message as read in the user's inbox.
   * `provider` is passed explicitly so the activity does not need a thread look-up.
   */
  async markEmailAsRead(
    userId: string,
    messageId: string,
    provider: string,
  ): Promise<{ success: boolean }> {
    if (provider === 'microsoft') {
      return this.microsoftOauthService.markEmailAsRead(userId, messageId);
    }

    return this.googleOauthService.markEmailAsRead(userId, messageId);
  }

  /**
   * Verify that the email thread still exists in the provider's mail store.
   */
  async checkThreadExists(userId: string, threadId: string): Promise<boolean> {
    const thread = await this.emailThreadsRepository.findById(threadId);

    if (!thread) {
      return false;
    }

    if (thread.provider === 'microsoft') {
      return this.microsoftOauthService.checkConversationExists(userId, thread.threadId);
    }

    return this.googleOauthService.checkThreadExists(userId, thread.threadId);
  }

  /**
   * Send a standalone (non-threaded) email via whichever provider the user has connected.
   */
  async sendStandaloneEmail(
    userId: string,
    to: string,
    subject: string,
    message: string,
  ): Promise<any> {
    const account = await this.googleOauthRepository.getConnectedAccountForUser(userId);

    if (account?.provider === 'microsoft') {
      return this.microsoftOauthService.sendEmail(userId, { to, subject, body: message });
    }

    return this.googleOauthService.sendStandaloneEmail(userId, to, subject, message);
  }

  /**
   * Helper to determine if an error is an authentication error for either provider.
   */
  isAuthenticationError(error: any): boolean {
    return this.googleOauthService.isAuthenticationError(error);
  }
}
