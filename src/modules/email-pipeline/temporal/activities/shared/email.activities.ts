import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { GoogleOauthService } from '../../../../google-oauth/google-oauth.service';
import { EmailThreadsRepository } from '../../../../../database/repos/email-threads.repository';

@Injectable()
@Activity()
export class EmailActivities {
  private readonly logger = new Logger(EmailActivities.name);

  constructor(
    private readonly googleOAuthService: GoogleOauthService,
    private readonly emailThreadsRepository: EmailThreadsRepository,
  ) {}

  @ActivityMethod({ name: 'sendCustomerNotificationViaGmailThread' })
  async sendCustomerNotificationViaGmailThread(
    userId: string,
    to: string,
    subject: string,
    message: string,
    threadId: string,
  ): Promise<any> {
    try {
      // Fetch the email thread from database to get the Gmail thread ID
      const emailThread = await this.emailThreadsRepository.findById(threadId);

      if (!emailThread) {
        throw new Error(`Email thread not found: ${threadId}`);
      }

      // Use the Gmail thread ID from the database record
      return await this.googleOAuthService.replyToGmailThread(
        userId,
        to,
        subject,
        message,
        emailThread.threadId,
      );
    } catch (error) {
      // Check if this is an authentication error
      if (this.googleOAuthService.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when sending email for user ${userId}. Account may need reconnection.`,
          error?.message,
        );
        throw new Error(
          `Gmail authentication failed. Please reconnect your Gmail account. Error: ${error?.message || 'Unknown error'}`,
        );
      }

      // Re-throw other errors
      throw error;
    }
  }

  @ActivityMethod({ name: 'checkForCustomerReplyInThread' })
  async checkForCustomerReplyInThread(
    userId: string,
    threadId: string,
    lastCheckedMessageId: string,
  ): Promise<{ hasNewReply: boolean; newEmail?: any }> {
    try {
      // Fetch the email thread from database to get the Gmail thread ID
      const emailThread = await this.emailThreadsRepository.findById(threadId);

      if (!emailThread) {
        throw new Error(`Email thread not found: ${threadId}`);
      }

      const gmail = await this.googleOAuthService.getGmailClient(userId);

      // Get the thread from Gmail
      const thread = await gmail.users.threads.get({
        userId: 'me',
        id: emailThread.threadId,
      });

      const messages = thread.data.messages || [];

      // Find messages after the last checked message
      const lastCheckedIndex = messages.findIndex(
        (msg) =>
          msg.id === lastCheckedMessageId ||
          msg.payload?.headers?.find((h) => h.name?.toLowerCase() === 'message-id')?.value ===
            lastCheckedMessageId,
      );

      if (lastCheckedIndex === -1 || lastCheckedIndex === messages.length - 1) {
        // No new messages
        return { hasNewReply: false };
      }

      // Get the latest message (customer's reply)
      const latestMessage = messages[messages.length - 1];
      const headers = latestMessage.payload?.headers || [];

      // Extract email details
      const fromHeader = headers.find((h) => h.name === 'From')?.value || '';
      const subjectHeader = headers.find((h) => h.name === 'Subject')?.value || '';

      // Get message body
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
          body: body,
        },
      };
    } catch (error) {
      // Check if this is an authentication error
      if (this.googleOAuthService.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when checking replies for user ${userId}. Account may need reconnection.`,
          error?.message,
        );
        throw new Error(
          `Gmail authentication failed. Please reconnect your Gmail account. Error: ${error?.message || 'Unknown error'}`,
        );
      }

      // Re-throw other errors
      throw error;
    }
  }

  @ActivityMethod({ name: 'markEmailAsRead' })
  async markEmailAsRead(userId: string, messageId: string): Promise<{ success: boolean }> {
    try {
      return await this.googleOAuthService.markEmailAsRead(userId, messageId);
    } catch (error) {
      if (this.googleOAuthService.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when marking email as read for user ${userId}`,
          error?.message,
        );
        throw new Error(
          `Gmail authentication failed. Please reconnect your Gmail account. Error: ${error?.message || 'Unknown error'}`,
        );
      }
      throw error;
    }
  }

  @ActivityMethod({ name: 'checkThreadExists' })
  async checkThreadExists(userId: string, threadId: string): Promise<boolean> {
    try {
      return await this.googleOAuthService.checkThreadExists(userId, threadId);
    } catch (error) {
      if (this.googleOAuthService.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when checking thread existence for user ${userId}`,
          error?.message,
        );
        throw new Error(
          `Gmail authentication failed. Please reconnect your Gmail account. Error: ${error?.message || 'Unknown error'}`,
        );
      }
      throw error;
    }
  }

  @ActivityMethod({ name: 'sendStandaloneEmail' })
  async sendStandaloneEmail(
    userId: string,
    to: string,
    subject: string,
    message: string,
  ): Promise<any> {
    try {
      return await this.googleOAuthService.sendStandaloneEmail(userId, to, subject, message);
    } catch (error) {
      if (this.googleOAuthService.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when sending standalone email for user ${userId}`,
          error?.message,
        );
        throw new Error(
          `Gmail authentication failed. Please reconnect your Gmail account. Error: ${error?.message || 'Unknown error'}`,
        );
      }
      throw error;
    }
  }
}
