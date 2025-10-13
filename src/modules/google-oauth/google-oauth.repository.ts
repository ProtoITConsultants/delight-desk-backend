import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { userOAuthAccounts } from '../../database/schema';
import { GoogleAccount } from './types/google-account.interface';

@Injectable()
export class GoogleOauthRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async removeExistingAccount(userId: string) {
    const result = await this.db
      .delete(userOAuthAccounts)
      .where(and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'google')))
      .returning({ id: userOAuthAccounts.id });

    return result.length > 0;
  }

  async addGoogleAccount(userId: string, account: GoogleAccount, scopes: []) {
    return this.db.insert(userOAuthAccounts).values({
      userId,
      email: account.email as string,
      provider: 'google',
      providerUserId: account.providerUserId,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      scopes: scopes,
      expiresAt: account.expiresAt,
    });
  }

  async getGoogleAccount(userId: string) {
    const [account] = await this.db
      .select()
      .from(userOAuthAccounts)
      .where(and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'google')));

    return account;
  }

  async updateGoogleAccount(userId: string, updates: Partial<GoogleAccount>) {
    return this.db
      .update(userOAuthAccounts)
      .set(updates)
      .where(and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'google')));
  }

  async disconnectGoogleAccount(userId: string) {
    return this.db
      .update(userOAuthAccounts)
      .set({ status: 'disconnected' })
      .where(and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'google')));
  }
}
