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
    await this.repo.removeExistingAccount(userId);
  }

  async getGmailClient(accessToken: string, refreshToken: string) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }
}
