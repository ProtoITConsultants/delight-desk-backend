import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { EmailProviderAdapter } from './email-provider.adapter';
import { EmailThreadsRepository } from 'src/database/repos/email-threads.repository';

@Injectable()
@Activity()
export class EmailActivities {
  private readonly logger = new Logger(EmailActivities.name);

  constructor(
    private readonly emailProviderAdapter: EmailProviderAdapter,
    private readonly emailThreadsRepository: EmailThreadsRepository,
  ) {}

  @ActivityMethod({ name: 'sendCustomerNotificationViaThread' })
  async sendCustomerNotificationViaThread(
    userId: string,
    to: string,
    subject: string,
    message: string,
    threadId: string,
  ): Promise<any> {
    try {
      return await this.emailProviderAdapter.replyToThread(userId, to, subject, message, threadId);
    } catch (error) {
      if (this.emailProviderAdapter.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when sending email for user ${userId}. Account may need reconnection.`,
          error?.message,
        );
        throw new Error(
          `Email authentication failed. Please reconnect your email account. Error: ${error?.message || 'Unknown error'}`,
        );
      }

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
      return await this.emailProviderAdapter.checkForCustomerReplyInThread(
        userId,
        threadId,
        lastCheckedMessageId,
      );
    } catch (error) {
      if (this.emailProviderAdapter.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when checking replies for user ${userId}. Account may need reconnection.`,
          error?.message,
        );
        throw new Error(
          `Email authentication failed. Please reconnect your email account. Error: ${error?.message || 'Unknown error'}`,
        );
      }

      throw error;
    }
  }

  @ActivityMethod({ name: 'markEmailAsRead' })
  async markEmailAsRead(userId: string, messageId: string): Promise<{ success: boolean }> {
    try {
      const provider = await this.resolveProviderForMessage(userId, messageId);
      return await this.emailProviderAdapter.markEmailAsRead(userId, messageId, provider);
    } catch (error) {
      if (this.emailProviderAdapter.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when marking email as read for user ${userId}`,
          error?.message,
        );
        throw new Error(
          `Email authentication failed. Please reconnect your email account. Error: ${error?.message || 'Unknown error'}`,
        );
      }
      throw error;
    }
  }

  @ActivityMethod({ name: 'checkThreadExists' })
  async checkThreadExists(userId: string, threadId: string): Promise<boolean> {
    try {
      return await this.emailProviderAdapter.checkThreadExists(userId, threadId);
    } catch (error) {
      if (this.emailProviderAdapter.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when checking thread existence for user ${userId}`,
          error?.message,
        );
        throw new Error(
          `Email authentication failed. Please reconnect your email account. Error: ${error?.message || 'Unknown error'}`,
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
      return await this.emailProviderAdapter.sendStandaloneEmail(userId, to, subject, message);
    } catch (error) {
      if (this.emailProviderAdapter.isAuthenticationError(error)) {
        this.logger.error(
          `Authentication error when sending standalone email for user ${userId}`,
          error?.message,
        );
        throw new Error(
          `Email authentication failed. Please reconnect your email account. Error: ${error?.message || 'Unknown error'}`,
        );
      }

      throw error;
    }
  }

  /**
   * The `markEmailAsRead` activity receives a provider-native message ID.
   * We look up the email's parent thread to determine which provider to use.
   * Falls back to 'google' to preserve backward-compatibility for existing threads.
   */
  private async resolveProviderForMessage(_userId: string, messageId: string): Promise<string> {
    try {
      return await this.emailThreadsRepository.getProviderByMessageId(messageId);
    } catch {
      return 'google';
    }
  }
}
