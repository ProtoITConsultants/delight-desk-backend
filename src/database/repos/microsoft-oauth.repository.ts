import { and, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { userOAuthAccounts } from '../../database/schema';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { MicrosoftAccount } from 'src/modules/microsoft-oauth/types/microsoft-account.interface';

@Injectable()
export class MicrosoftOauthRepository {
  constructor(@Inject(DATABASE_CONNECTION) private db: NodePgDatabase) {}

  async removeExistingAccount(userId: string) {
    const result = await this.db
      .delete(userOAuthAccounts)
      .where(and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'microsoft')))
      .returning({ id: userOAuthAccounts.id });

    return result.length > 0;
  }

  async accountExists(userId: string): Promise<boolean> {
    const [exists] = await this.db
      .select({ id: userOAuthAccounts.id })
      .from(userOAuthAccounts)
      .where(eq(userOAuthAccounts.userId, userId))
      .limit(1);

    return !!exists;
  }

  async addMicrosoftAccount(userId: string, account: MicrosoftAccount, scopes: string[] = []) {
    return this.db.insert(userOAuthAccounts).values({
      userId,
      provider: 'microsoft',
      email: account.email as string,
      providerUserId: account.providerUserId,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      scopes: scopes,
      expiresAt: account.expiresAt,
    });
  }

  async getMicrosoftAccount(userId: string) {
    const [account] = await this.db
      .select()
      .from(userOAuthAccounts)
      .where(
        and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'microsoft')),
      );

    return account;
  }

  async updateMicrosoftAccount(userId: string, updates: any) {
    return this.db
      .update(userOAuthAccounts)
      .set(updates)
      .where(
        and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'microsoft')),
      );
  }

  async disconnectMicrosoftAccount(userId: string) {
    return this.db
      .update(userOAuthAccounts)
      .set({ status: 'disconnected' })
      .where(
        and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'microsoft')),
      );
  }
}
