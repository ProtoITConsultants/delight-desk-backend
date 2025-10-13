import { Injectable } from '@nestjs/common';
import { MicrosoftOauthRepository } from './microsoft-oauth.repository';
import { Client } from '@microsoft/microsoft-graph-client';

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

  async getGraphClientForUser(userId: string): Promise<Client> {
    const account = await this.repo.getMicrosoftAccount(userId);

    if (!account) {
      throw new Error('Microsoft account not connected');
    }

    if (new Date(account.expiresAt).getTime() <= Date.now()) {
      throw new Error('Access token expired, refresh flow needed');
    }

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
}
