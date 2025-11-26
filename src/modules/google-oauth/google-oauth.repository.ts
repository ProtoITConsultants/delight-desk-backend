import { eq, and } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { GoogleAccount } from './types/google-account.interface';
import { DATABASE_CONNECTION } from '../../database/database.module';
import { userOAuthAccounts, emailThreads, emails } from '../../database/schema';

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

  async getGoogleAccountByEmail(email: string) {
    const [account] = await this.db
      .select()
      .from(userOAuthAccounts)
      .where(and(eq(userOAuthAccounts.email, email), eq(userOAuthAccounts.provider, 'google')));

    return account;
  }

  async updateGoogleAccount(userId: string, updates: any) {
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

  async findThreadByThreadId(threadId: string) {
    const [thread] = await this.db
      .select()
      .from(emailThreads)
      .where(eq(emailThreads.threadId, threadId));
    return thread;
  }

  async createThread(userId: string, threadId: string, subject?: string) {
    const [thread] = await this.db
      .insert(emailThreads)
      .values({
        threadId: threadId,
        userId: userId,
        subject: subject || null,
      })
      .returning({ id: emailThreads.id, threadId: emailThreads.threadId });

    return thread;
  }

  async upsertThread(userId: string, threadId: string, subject?: string) {
    const existing = await this.findThreadByThreadId(threadId);
    if (existing) return existing;
    return this.createThread(userId, threadId, subject);
  }

  async insertEmailIfNotExists(payload: any) {
    try {
      await this.db.insert(emails).values(payload);
      return { inserted: true };
    } catch (err: any) {
      if (err?.code === '23505') return { inserted: false, reason: 'duplicate' };
      throw err;
    }
  }
}
