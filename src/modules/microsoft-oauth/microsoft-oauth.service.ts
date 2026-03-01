import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@microsoft/microsoft-graph-client';
import { MicrosoftOauthRepository } from 'src/database/repos/microsoft-oauth.repository';

/** Buffer before expiry (ms) to consider token "expiring soon" for auto-refresh. 24 hours. */
const TOKEN_EXPIRY_BUFFER_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MicrosoftOauthService {
  private readonly logger = new Logger(MicrosoftOauthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly repo: MicrosoftOauthRepository,
  ) {}

  async accountExists(userId: string) {
    return await this.repo.accountExists(userId);
  }

  async connectMicrosoftAccount(userId: string, microsoftAccount: any, scopes: string[]) {
    await this.repo.removeExistingAccount(userId);
    await this.repo.addMicrosoftAccount(userId, microsoftAccount, scopes);
    await this.createMailSubscription(userId);
  }

  async disconnectMicrosoftAccount(userId: string) {
    return await this.repo.removeExistingAccount(userId);
  }

  async getGraphClientForUser(userId: string): Promise<Client> {
    const account = await this.getValidAccount(userId);
    return this.getGraphClient(account.accessToken);
  }

  async getUserProfile(userId: string) {
    const client = await this.getGraphClientForUser(userId);
    return client.api('/me').get();
  }

  async getUserInbox(userId: string) {
    const client = await this.getGraphClientForUser(userId);
    return client.api('/me/mailFolders/Inbox/messages').top(10).get();
  }

  async sendEmail(
    userId: string,
    params: { to: string; subject: string; body: string },
  ): Promise<{ success: boolean }> {
    const client = await this.getGraphClientForUser(userId);

    const message = {
      message: {
        subject: params.subject,
        body: {
          contentType: 'Text',
          content: params.body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: params.to,
            },
          },
        ],
      },
      saveToSentItems: true,
    };

    await client.api('/me/sendMail').post(message);

    return { success: true };
  }

  async refreshToken(userId: string) {
    const account = await this.repo.getMicrosoftAccount(userId);
    if (!account) {
      throw new Error('Microsoft account not connected');
    }
    return await this.refreshAccessToken(userId, account);
  }

  async getAccountStatus(userId: string) {
    const account = await this.repo.getMicrosoftAccount(userId);
    if (!account) {
      return { connected: false };
    }

    const isExpired = new Date(account.expiresAt).getTime() <= Date.now();
    return {
      connected: true,
      provider: account.provider,
      email: account.email,
      expiresAt: account.expiresAt,
      isExpired,
      canRefresh: !!account.refreshToken,
    };
  }

  /**
   * Auto-refresh tokens for all users with a connected Microsoft account whose
   * access token is expired or will expire within the configured buffer (default 24h).
   * Can be called periodically (e.g. from a cron job) to keep tokens valid.
   */
  async autoRefreshTokensForAllUsers(): Promise<{
    total: number;
    refreshed: number;
    failed: number;
    skipped: number;
  }> {
    const accounts = await this.repo.getAllMicrosoftAccounts();

    this.logger.log({
      event: 'microsoft_token_auto_refresh_started',
      count: accounts.length,
      timestamp: new Date().toISOString(),
    });

    let refreshed = 0;
    let failed = 0;
    let skipped = 0;

    for (const account of accounts) {
      try {
        if (account.status === 'disconnected') {
          skipped++;
          continue;
        }

        const expiresAtMs = new Date(account.expiresAt).getTime();
        const willExpireSoon = expiresAtMs - TOKEN_EXPIRY_BUFFER_MS <= Date.now();

        if (!willExpireSoon) {
          skipped++;
          continue;
        }

        this.logger.log({
          event: 'microsoft_token_expiring_soon',
          userId: account.userId,
          email: account.email,
          expiresAt: account.expiresAt,
          timestamp: new Date().toISOString(),
        });

        await this.refreshAccessToken(account.userId, account);
        refreshed++;
      } catch (error: any) {
        this.logger.error({
          event: 'microsoft_token_auto_refresh_error',
          userId: account.userId,
          email: account.email,
          error: error?.message || 'Unknown error',
          timestamp: new Date().toISOString(),
        });
        failed++;
      }
    }

    this.logger.log({
      event: 'microsoft_token_auto_refresh_completed',
      total: accounts.length,
      refreshed,
      failed,
      skipped,
      timestamp: new Date().toISOString(),
    });

    return { total: accounts.length, refreshed, failed, skipped };
  }

  async createMailSubscription(userId: string) {
    const account = await this.getValidAccount(userId);
    const client = this.getGraphClient(account.accessToken);

    const notificationUrl = this.configService.get('MICROSOFT_OUTLOOK_WEBHOOK_URL');
    if (!notificationUrl) {
      throw new Error('MICROSOFT_OUTLOOK_WEBHOOK_URL not configured');
    }

    const expiration = new Date(Date.now() + 60 * 60 * 1000 * 24); // 24 hours

    const body = {
      changeType: 'created',
      notificationUrl,
      resource: 'me/messages',
      expirationDateTime: expiration.toISOString(),
      clientState: `${userId}-${Date.now()}`,
    };

    const subscription = await client.api('/subscriptions').post(body);

    await this.repo.updateMicrosoftAccount(userId, {
      subscriptionId: subscription.id,
      subscriptionExpiry: subscription.expirationDateTime,
    });

    return subscription;
  }

  async markEmailAsRead(userId: string, messageId: string): Promise<{ success: boolean }> {
    const client = await this.getGraphClientForUser(userId);

    await client.api(`/me/messages/${messageId}`).patch({
      isRead: true,
    });

    return { success: true };
  }

  async processNotifications(body: any) {
    if (!body?.value?.length) return;

    for (const notification of body.value) {
      const subscriptionId = notification.subscriptionId;
      const messageId = notification.resourceData?.id;

      if (!messageId || !subscriptionId) continue;

      // const account = await this.repo.getMicrosoftAccountBySubscriptionId(subscriptionId);
      // if (!account) {
      //   console.error(`Unknown subscription ${subscriptionId}`);
      //   continue;
      // }

      // const client = this.getClient(account.accessToken);

      // const message = await client.api(`/me/messages/${messageId}`).get();

      // await this.handleIncomingMail(account.userId, message);
    }
  }

  private getClient(token: string): Client {
    return Client.init({
      authProvider: (done) => {
        done(null, token);
      },
    });
  }

  private getGraphClient(accessToken: string): Client {
    return Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
  }

  private async refreshAccessToken(userId: string, currentAccount: any): Promise<any> {
    const refreshToken = currentAccount.refreshToken;

    if (!refreshToken) {
      throw new Error('No refresh token available for user');
    }

    try {
      const tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

      const data = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        scope:
          process.env.MICROSOFT_SCOPES ||
          'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
      });

      const response = await axios.post(tokenUrl, data.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, refresh_token, expires_in } = response.data as any;

      const updatedAccount = {
        ...currentAccount,
        accessToken: access_token,
        refreshToken: refresh_token || refreshToken,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      };

      await this.repo.updateMicrosoftAccount(currentAccount.userId, {
        accessToken: access_token,
        refreshToken: refresh_token || refreshToken,
        expiresAt: new Date(Date.now() + expires_in * 1000),
      });

      return updatedAccount;
    } catch (error) {
      throw new Error('Failed to refresh access token');
    }
  }

  private async getValidAccount(userId: string): Promise<any> {
    const account = await this.repo.getMicrosoftAccount(userId);

    if (!account) {
      throw new Error('Microsoft account not connected');
    }

    if (new Date(account.expiresAt).getTime() <= Date.now()) {
      return await this.refreshAccessToken(userId, account);
    }

    return account;
  }

  private async handleIncomingMail(userId: string, message: any) {
    // TODO: Save to DB
    console.log(`New email for user ${userId}: ${message.subject}`);
  }
}
