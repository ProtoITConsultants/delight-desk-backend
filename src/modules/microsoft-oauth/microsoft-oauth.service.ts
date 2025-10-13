import { Injectable } from '@nestjs/common';
import { MicrosoftOauthRepository } from './microsoft-oauth.repository';
import { Client } from '@microsoft/microsoft-graph-client';
import axios from 'axios';

@Injectable()
export class MicrosoftOauthService {
  constructor(private readonly repo: MicrosoftOauthRepository) {}

  async connectMicrosoftAccount(userId: string, microsoftAccount: any, scopes: string[]) {
    await this.repo.removeExistingAccount(userId);
    await this.repo.addMicrosoftAccount(userId, microsoftAccount, scopes);
  }

  async disconnectMicrosoftAccount(userId: string) {
    return await this.repo.disconnectMicrosoftAccount(userId);
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

  async sendEmail(userId: string, message: any) {
    const client = await this.getGraphClientForUser(userId);
    return client.api('/me/sendMail').post({
      message: message,
    });
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
}
