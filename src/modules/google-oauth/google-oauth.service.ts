import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { GoogleOauthRepository } from './google-oauth.repository';
import { GoogleAccount } from './types/google-account.interface';

@Injectable()
export class GoogleOauthService {
  constructor(private readonly repo: GoogleOauthRepository) {}

  async connectGoogleAccount(userId: string, googleAccount: GoogleAccount, scopes: []) {
    await this.repo.removeExistingAccount(userId);
    await this.repo.addGoogleAccount(userId, googleAccount, scopes);
  }

  async disconnectGoogleAccount(userId: string) {
    return await this.repo.disconnectGoogleAccount(userId);
  }

  private getOAuth2Client(refreshToken?: string, accessToken?: string) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL,
    );

    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return oauth2Client;
  }

  async getGmailClient(userId: string) {
    const account = await this.repo.getGoogleAccount(userId);

    if (!account) {
      throw new Error('Google account not connected');
    }

    const oauth2Client = this.getOAuth2Client(account.refreshToken, account.accessToken);

    if (new Date(account.expiresAt).getTime() <= Date.now()) {
      const { credentials } = await oauth2Client.refreshAccessToken();

      await this.repo.updateGoogleAccount(userId, {
        accessToken: credentials.access_token as string,
        expiresAt: credentials.expiry_date as any,
      });

      oauth2Client.setCredentials(credentials);
    }

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }
}
