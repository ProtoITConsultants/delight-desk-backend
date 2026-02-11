import { google } from 'googleapis';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAccount } from './types/google-account.interface';
import { GoogleOauthRepository } from 'src/database/repos/google-oauth.repository';
import { SendgridService } from '../sendgrid/sendgrid.service';
import { UserRepository } from 'src/database/repos/users.repository';
import { GmailService } from './services/gmail.service';
import { GmailWebhookService } from './services/gmail-webhook.service';
import { TOKEN_EXPIRY_BUFFER_MS } from './constants/gmail.constants';

/**
 * Service for managing Google OAuth connections and token lifecycle
 */
@Injectable()
export class GoogleOauthService {
  private readonly logger = new Logger(GoogleOauthService.name);

  constructor(
    private readonly repo: GoogleOauthRepository,
    private readonly configService: ConfigService,
    private readonly sendgridService: SendgridService,
    private readonly usersRepository: UserRepository,
    private readonly gmailService: GmailService,
    private readonly gmailWebhookService: GmailWebhookService,
  ) {}

  // ============================================================================
  // OAuth Account Management
  // ============================================================================

  /**
   * Check if user has a Google account connected
   */
  async accountExists(userId: string): Promise<boolean> {
    return await this.repo.accountExists(userId);
  }

  /**
   * Connect a Google account to user profile
   */
  async connectGoogleAccount(
    userId: string,
    googleAccount: GoogleAccount,
    scopes: [],
  ): Promise<void> {
    await this.repo.removeExistingAccount(userId);
    await this.repo.addGoogleAccount(userId, googleAccount, scopes);
  }

  /**
   * Disconnect Google account from user profile
   */
  async disconnectGoogleAccount(userId: string): Promise<boolean> {
    return await this.repo.removeExistingAccount(userId);
  }

  // ============================================================================
  // Gmail Client & Token Management
  // ============================================================================

  /**
   * Get authenticated Gmail client for a user
   * Automatically refreshes token if expired or about to expire
   */
  async getGmailClient(userId: string) {
    const account = await this.repo.getGoogleAccount(userId);

    if (!account) {
      throw new Error('Google account not connected');
    }

    // Check if account is marked as disconnected
    if (account.status === 'disconnected') {
      throw new Error(
        'Google account needs re-authentication. Please reconnect your Gmail account.',
      );
    }

    const oauth2Client = this.getOAuth2Client(account.refreshToken, account.accessToken);

    // Refresh token if expired or about to expire
    const needsRefresh =
      new Date(account.expiresAt).getTime() - TOKEN_EXPIRY_BUFFER_MS <= Date.now();

    if (needsRefresh) {
      await this.refreshAccessToken(userId, account, oauth2Client);
    }

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  /**
   * Set up Gmail watch for push notifications
   */
  async watchGmail(userId: string): Promise<void> {
    const gmail = await this.getGmailClient(userId);

    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: this.configService.get('GOOGLE_PUBSUB_TOPIC_NAME'),
      },
    });

    const lastHistoryId = res.data.historyId;
    await this.repo.updateGoogleAccount(userId, { lastHistoryId });
  }

  // ============================================================================
  // Gmail API Operations (delegated to GmailService)
  // ============================================================================

  /**
   * Reply to a Gmail thread
   */
  async replyToGmailThread(
    userId: string,
    to: string,
    subject: string,
    message: string,
    threadId: string,
  ): Promise<void> {
    const gmail = await this.getGmailClient(userId);
    return this.gmailService.replyToThread(gmail, to, subject, message, threadId);
  }

  /**
   * Check if a Gmail thread exists
   */
  async checkThreadExists(userId: string, threadId: string): Promise<boolean> {
    const gmail = await this.getGmailClient(userId);
    return this.gmailService.threadExists(gmail, threadId);
  }

  /**
   * Send a standalone email (not a reply)
   */
  async sendStandaloneEmail(
    userId: string,
    to: string,
    subject: string,
    message: string,
  ): Promise<{ success: boolean }> {
    const gmail = await this.getGmailClient(userId);
    return this.gmailService.sendStandaloneEmail(gmail, to, subject, message);
  }

  /**
   * Mark an email as read
   */
  async markEmailAsRead(userId: string, messageId: string): Promise<{ success: boolean }> {
    const gmail = await this.getGmailClient(userId);
    return this.gmailService.markAsRead(gmail, messageId);
  }

  // ============================================================================
  // Webhook Processing (delegated to GmailWebhookService)
  // ============================================================================

  /**
   * Process new emails from Gmail webhook notification
   */
  async processNewEmails(email: string, newHistoryId: string | number): Promise<void> {
    const account = await this.repo.getGoogleAccountByEmail(email);
    if (!account) {
      return;
    }

    const gmail = await this.getGmailClient(account.userId);
    await this.gmailWebhookService.processNewEmails(gmail, email, newHistoryId);
  }

  // ============================================================================
  // Token Refresh & Error Handling
  // ============================================================================

  /**
   * Refresh access token for a user
   */
  private async refreshAccessToken(userId: string, account: any, oauth2Client: any): Promise<void> {
    try {
      this.logger.log({
        event: 'token_refresh_started',
        userId,
        email: account.email,
        operation: 'getGmailClient',
        expiresAt: account.expiresAt,
        timestamp: new Date().toISOString(),
      });

      const { credentials } = await oauth2Client.refreshAccessToken();

      await this.repo.updateGoogleAccount(userId, {
        accessToken: credentials.access_token as any,
        expiresAt: new Date(credentials.expiry_date as any),
        status: 'connected',
      });

      oauth2Client.setCredentials(credentials);

      this.logger.log({
        event: 'token_refresh_success',
        userId,
        email: account.email,
        operation: 'getGmailClient',
        newExpiresAt: new Date(credentials.expiry_date as any),
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      await this.handleTokenRefreshError(userId, account, error);
    }
  }

  /**
   * Handle token refresh errors
   */
  private async handleTokenRefreshError(userId: string, account: any, error: any): Promise<void> {
    this.logger.error({
      event: 'token_refresh_failed',
      userId,
      email: account.email,
      operation: 'getGmailClient',
      error: error?.message || 'Unknown error',
      errorCode: error?.response?.status || error?.code,
      timestamp: new Date().toISOString(),
    });

    // Check if refresh token is expired or revoked
    if (this.isRefreshTokenInvalid(error)) {
      // Mark account as disconnected
      await this.repo.updateGoogleAccount(userId, {
        status: 'disconnected',
      });

      this.logger.warn({
        event: 'account_marked_disconnected',
        userId,
        email: account.email,
        reason: 'invalid_refresh_token',
        operation: 'getGmailClient',
        timestamp: new Date().toISOString(),
      });

      // Notify user to reconnect
      // await this.notifyUserToReconnect(userId).catch((notifyError) => {
      //   this.logger.error({
      //     event: 'notification_failed',
      //     userId,
      //     operation: 'notifyUserToReconnect',
      //     error: notifyError?.message || 'Unknown error',
      //     timestamp: new Date().toISOString(),
      //   });
      // });

      throw new Error(
        'Google account needs re-authentication. Please reconnect your Gmail account.',
      );
    }

    // For other errors, rethrow
    throw new Error(`Failed to refresh Google access token: ${error?.message || 'Unknown error'}`);
  }

  /**
   * Check if error indicates refresh token is invalid, expired, or revoked
   */
  isRefreshTokenInvalid(error: any): boolean {
    if (!error) return false;

    const errorMessage = error?.message?.toLowerCase() || '';
    const errorCode = error?.response?.status || error?.code;

    return (
      errorCode === 400 ||
      errorCode === 401 ||
      errorMessage.includes('invalid_grant') ||
      errorMessage.includes('token has been expired') ||
      errorMessage.includes('token has been revoked') ||
      errorMessage.includes('invalid refresh token')
    );
  }

  /**
   * Check if error indicates authentication/authorization failure
   */
  isAuthenticationError(error: any): boolean {
    if (!error) return false;

    const errorCode = error?.response?.status || error?.code;
    const errorMessage = error?.message?.toLowerCase() || '';

    return (
      errorCode === 401 ||
      errorCode === 403 ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('authentication') ||
      this.isRefreshTokenInvalid(error)
    );
  }

  // ============================================================================
  // User Notifications
  // ============================================================================

  /**
   * Notify user that their Google account needs reconnection
   */
  private async notifyUserToReconnect(userId: string): Promise<void> {
    try {
      this.logger.warn({
        event: 'user_reconnect_needed',
        userId,
        operation: 'notifyUserToReconnect',
        timestamp: new Date().toISOString(),
      });

      const user = await this.usersRepository.findById(userId);

      if (!user || !user.email) {
        this.logger.error({
          event: 'notification_user_not_found',
          userId,
          operation: 'notifyUserToReconnect',
          reason: 'user_not_found_or_no_email',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      await this.sendgridService.sendOAuthReconnectEmail(user.email, 'google');

      this.logger.log({
        event: 'reconnect_notification_sent',
        userId,
        email: user.email,
        operation: 'notifyUserToReconnect',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      this.logger.error({
        event: 'notification_error',
        userId,
        operation: 'notifyUserToReconnect',
        error: error?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Create OAuth2 client
   */
  getOAuth2Client(refreshToken?: string, accessToken?: string) {
    const oauth2Client = new google.auth.OAuth2(
      this.configService.get('GOOGLE_CLIENT_ID'),
      this.configService.get('GOOGLE_CLIENT_SECRET'),
      this.configService.get('GOOGLE_CALLBACK_URL'),
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return oauth2Client;
  }
}
