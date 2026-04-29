import { and, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database.module';
import { emails, emailThreads, userOAuthAccounts } from '../schema';
import { GoogleAccount } from 'src/modules/google-oauth/types/google-account.interface';

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

  async removeAccountById(id: string) {
    const result = await this.db
      .delete(userOAuthAccounts)
      .where(eq(userOAuthAccounts.id, id))
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

  async accountExists(userId: string): Promise<{ status: string } | undefined> {
    const [exists] = await this.db
      .select({ status: userOAuthAccounts.status })
      .from(userOAuthAccounts)
      .where(
        and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.provider, 'google')),
      )
      .limit(1);

    return exists;
  }

  async getAllGoogleAccounts() {
    return this.db.select().from(userOAuthAccounts).where(eq(userOAuthAccounts.provider, 'google'));
  }

  async getConnectedAccountForUser(userId: string) {
    const [account] = await this.db
      .select({ provider: userOAuthAccounts.provider })
      .from(userOAuthAccounts)
      .where(and(eq(userOAuthAccounts.userId, userId), eq(userOAuthAccounts.status, 'connected')))
      .limit(1);

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

  async createThread(
    userId: string,
    threadId: string,
    subject?: string,
    provider: 'google' | 'microsoft' = 'google',
    initiatedBy: 'customer' | 'owner' = 'customer',
  ) {
    const [thread] = await this.db
      .insert(emailThreads)
      .values({
        threadId,
        userId,
        subject: subject || null,
        provider,
        initiatedBy,
      })
      .returning({
        id: emailThreads.id,
        threadId: emailThreads.threadId,
        initiatedBy: emailThreads.initiatedBy,
      });

    return thread;
  }

  async upsertThread(userId: string, threadId: string, subject?: string) {
    const existing = await this.findThreadByThreadId(threadId);
    if (existing) return { thread: existing, isNew: false as const };
    const thread = await this.createThread(userId, threadId, subject);
    return { thread, isNew: true as const };
  }

  async upsertThreadWithProvider(
    userId: string,
    threadId: string,
    subject: string | null | undefined,
    provider: 'google' | 'microsoft',
    initiatedBy: 'customer' | 'owner' = 'customer',
  ) {
    const existing = await this.findThreadByThreadId(threadId);
    if (existing) return { thread: existing, isNew: false as const };
    const thread = await this.createThread(
      userId,
      threadId,
      subject ?? undefined,
      provider,
      initiatedBy,
    );
    return { thread, isNew: true as const };
  }

  async updateThreadById(id: string, data: { initiatedBy?: string; workflowId?: string }) {
    await this.db.update(emailThreads).set(data).where(eq(emailThreads.id, id));
  }

  async insertEmailIfNotExists(payload: any) {
    try {
      const insertedEmail = await this.db.insert(emails).values(payload).returning();
      return { inserted: true, insertedEmail: insertedEmail[0] };
    } catch (err: any) {
      return { inserted: false };
    }
  }
}
