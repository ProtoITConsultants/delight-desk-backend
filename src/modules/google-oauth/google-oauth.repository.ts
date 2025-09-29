import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { userOAuthAccounts } from '../../database/schema';
import { GoogleAccount } from './types/google-account.interface';

@Injectable()
export class GoogleOauthRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async removeExistingAccount(userId: string) {
    await this.db.delete(userOAuthAccounts).where(eq(userOAuthAccounts.userId, userId));
  }

  async addGoogleAccount(userId: string, account: GoogleAccount, scopes: []) {
    return this.db.insert(userOAuthAccounts).values({
      userId,
      provider: 'google',
      providerUserId: account.providerUserId,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      scopes: scopes,
      expiresAt: account.expiresAt,
    });
  }
}
