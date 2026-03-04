import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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

  async connectMicrosoftAccount(userId: string, microsoftAccount: any) {
    await this.repo.removeExistingAccount(userId);
    await this.repo.addMicrosoftAccount(userId, microsoftAccount);

    // Subscription creation is best-effort — a missing/unreachable webhook URL should not
    // prevent the account from being connected. It can be retried via /microsoft-oauth/subscribe.
    try {
      await this.createMailSubscription(userId);
    } catch (err: any) {
      this.logger.warn({
        event: 'outlook_subscription_create_failed_on_connect',
        userId,
        error: err?.message,
        hint: 'Ensure MICROSOFT_OUTLOOK_WEBHOOK_URL is set to a public HTTPS URL. Retry via POST /microsoft-oauth/subscribe.',
      });
    }
  }

  async disconnectMicrosoftAccount(userId: string) {
    // Best-effort: delete ALL active Graph subscriptions so Microsoft stops
    // sending webhooks immediately.  We list them from the API rather than
    // relying solely on the DB-stored ID, because previous sessions may have
    // created subscriptions whose IDs were later overwritten in the DB.
    try {
      const client = await this.getGraphClientForUser(userId);
      await this.deleteAllGraphSubscriptions(client, userId);
    } catch (err: any) {
      this.logger.warn({
        event: 'outlook_subscription_delete_failed',
        userId,
        error: err?.message,
        hint: 'Proceeding with account removal anyway',
      });
    }

    return await this.repo.removeExistingAccount(userId);
  }

  /**
   * List every active subscription registered under the authenticated account
   * and delete them all.  This cleans up stale subscriptions left over from
   * previous connect/reconnect cycles whose IDs are no longer in the DB.
   */
  private async deleteAllGraphSubscriptions(client: Client, userId: string): Promise<void> {
    const response = await client.api('/subscriptions').get();
    const subscriptions: Array<{ id: string }> = response?.value ?? [];

    if (subscriptions.length === 0) {
      this.logger.debug({ event: 'outlook_no_subscriptions_to_delete', userId });
      return;
    }

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await client.api(`/subscriptions/${sub.id}`).delete();
          this.logger.log({
            event: 'outlook_subscription_deleted',
            userId,
            subscriptionId: sub.id,
          });
        } catch (err: any) {
          // 404 means it already expired/was deleted — safe to ignore
          if (err?.statusCode !== 404) {
            this.logger.warn({
              event: 'outlook_subscription_single_delete_failed',
              userId,
              subscriptionId: sub.id,
              error: err?.message,
            });
          }
        }
      }),
    );
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
          contentType: 'HTML',
          content: MicrosoftOauthService.plainTextToHtml(params.body),
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
    this.logger.log({
      event: 'outlook_subscription_create_started',
      userId,
      timestamp: new Date().toISOString(),
    });

    const client = await this.getGraphClientForUser(userId);
    const account = await this.getValidAccount(userId);

    // Remove any leftover subscriptions from previous sessions before creating
    // a new one.  Without this, every reconnect leaks a stale subscription that
    // keeps firing webhooks even after it is no longer tracked in the DB.
    try {
      await this.deleteAllGraphSubscriptions(client, userId);
    } catch (err: any) {
      this.logger.warn({
        event: 'outlook_pre_create_cleanup_failed',
        userId,
        error: err?.message,
        hint: 'Proceeding with subscription creation anyway',
      });
    }

    this.logger.debug({
      event: 'outlook_subscription_account_resolved',
      userId,
      email: account.email ?? '(unknown)',
    });

    const notificationUrl = this.configService.get('MICROSOFT_OUTLOOK_WEBHOOK_URL');
    if (!notificationUrl) {
      this.logger.error({
        event: 'outlook_subscription_config_missing',
        userId,
        message: 'MICROSOFT_OUTLOOK_WEBHOOK_URL not configured',
      });
      throw new Error('MICROSOFT_OUTLOOK_WEBHOOK_URL not configured');
    }

    const expiration = new Date(Date.now() + 60 * 60 * 1000 * 24); // 24 hours
    const clientState = `${userId}-${Date.now()}`;

    const body = {
      changeType: 'created',
      notificationUrl,
      resource: 'me/messages',
      expirationDateTime: expiration,
      clientState,
    };

    this.logger.log({
      event: 'outlook_subscription_request',
      userId,
      resource: body.resource,
      changeType: body.changeType,
      expirationDateTime: expiration.toISOString(),
      notificationUrlHost: (() => {
        try {
          return new URL(notificationUrl).host;
        } catch {
          return '(invalid-url)';
        }
      })(),
    });

    let subscription: any;
    try {
      subscription = await client.api('/subscriptions').post(body);
    } catch (err: any) {
      this.logger.error({
        event: 'outlook_subscription_api_error',
        userId,
        error: err?.message ?? String(err),
        status: err?.statusCode ?? err?.response?.status,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }

    this.logger.log({
      event: 'outlook_subscription_created',
      userId,
      subscriptionId: subscription.id,
      expirationDateTime: subscription.expirationDateTime,
    });

    await this.repo.updateMicrosoftAccount(userId, {
      subscriptionId: subscription.id,
      subscriptionExpiry: new Date(subscription.expirationDateTime),
    });

    this.logger.log({
      event: 'outlook_subscription_persisted',
      userId,
      subscriptionId: subscription.id,
      timestamp: new Date().toISOString(),
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

  /**
   * Reply to an Outlook conversation thread using Graph API's native reply endpoint.
   * This preserves Outlook's threading automatically.
   *
   * When `lastMessageId` is supplied (preferred) we reply directly to that message,
   * completely avoiding a Graph $filter query which can cause InefficientFilter (400)
   * errors on the /me/messages endpoint. The caller should always pass the provider-native
   * message ID of the most-recent email it ingested for this conversation.
   *
   * Fallback (no lastMessageId): fetches messages filtered by conversationId without
   * $orderby (Graph rejects $filter+$orderby with InefficientFilter) and sorts client-side.
   */
  async replyToOutlookThread(
    userId: string,
    conversationId: string,
    message: string,
    lastMessageId?: string,
  ): Promise<{ success: boolean }> {
    const client = await this.getGraphClientForUser(userId);

    const htmlBody = MicrosoftOauthService.plainTextToHtml(message);
    const replyPayload = {
      message: {
        body: {
          contentType: 'HTML',
          content: htmlBody,
        },
      },
    };

    if (lastMessageId) {
      await client.api(`/me/messages/${lastMessageId}/reply`).post(replyPayload);
      return { success: true };
    }

    // Fallback: query by conversationId without $orderby to avoid InefficientFilter.
    const result = await client
      .api('/me/messages')
      .filter(`conversationId eq '${conversationId}'`)
      .select('id,receivedDateTime')
      .get();

    const messages: any[] = result?.value || [];
    if (!messages.length) {
      throw new Error(`No messages found in Outlook conversation: ${conversationId}`);
    }

    const latestMessage = messages.sort(
      (a: any, b: any) =>
        new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime(),
    )[0];

    await client.api(`/me/messages/${latestMessage.id}/reply`).post(replyPayload);

    return { success: true };
  }

  /**
   * Check if a customer has replied in an Outlook conversation after a given message.
   *
   * NOTE: Microsoft Graph does not support combining $filter=conversationId with $orderby
   * on the /me/messages endpoint (throws InefficientFilter / 400). We fetch without $orderby
   * and sort client-side.
   */
  async checkForCustomerReplyInOutlookThread(
    userId: string,
    conversationId: string,
    lastCheckedMessageId: string,
  ): Promise<{ hasNewReply: boolean; newEmail?: any }> {
    const client = await this.getGraphClientForUser(userId);
    const account = await this.repo.getMicrosoftAccount(userId);
    const userEmail = account?.email?.toLowerCase() || '';

    // Do NOT combine $filter with $orderby — Graph API rejects it with InefficientFilter.
    const result = await client
      .api('/me/messages')
      .filter(`conversationId eq '${conversationId}'`)
      .select('id,subject,from,body,receivedDateTime')
      .get();

    // Sort client-side ascending by receivedDateTime (Graph returns unordered without $orderby)
    const messages: any[] = (result?.value || []).sort(
      (a: any, b: any) =>
        new Date(a.receivedDateTime).getTime() - new Date(b.receivedDateTime).getTime(),
    );

    const lastCheckedIndex = messages.findIndex((m: any) => m.id === lastCheckedMessageId);

    if (lastCheckedIndex === -1 || lastCheckedIndex === messages.length - 1) {
      return { hasNewReply: false };
    }

    // Find the first message after the last checked that is from the customer (not the account owner)
    const newMessages = messages.slice(lastCheckedIndex + 1);
    const customerMessage = newMessages.find(
      (m: any) => m.from?.emailAddress?.address?.toLowerCase() !== userEmail,
    );

    if (!customerMessage) {
      return { hasNewReply: false };
    }

    const bodyContent =
      customerMessage.body?.contentType === 'text'
        ? customerMessage.body?.content
        : customerMessage.body?.content?.replace(/<[^>]+>/g, '') || '';

    return {
      hasNewReply: true,
      newEmail: {
        messageId: customerMessage.id,
        from: customerMessage.from?.emailAddress?.address || '',
        subject: customerMessage.subject || '',
        body: bodyContent,
      },
    };
  }

  /**
   * Check whether an Outlook conversation still exists (has at least one message).
   */
  async checkConversationExists(userId: string, conversationId: string): Promise<boolean> {
    try {
      const client = await this.getGraphClientForUser(userId);

      const result = await client
        .api('/me/messages')
        .filter(`conversationId eq '${conversationId}'`)
        .top(1)
        .select('id')
        .get();

      return (result?.value?.length ?? 0) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Renew Microsoft Graph webhook subscriptions that are expiring within 24 hours.
   * Runs every 12 hours. If a subscription cannot be renewed it is re-created.
   */
  @Cron(CronExpression.EVERY_12_HOURS)
  async renewExpiringSubscriptions(): Promise<void> {
    const threshold = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const accounts = await this.repo.getMicrosoftAccountsWithExpiringSubscriptions(threshold);

    this.logger.log({
      event: 'outlook_subscription_renewal_started',
      count: accounts.length,
    });

    for (const account of accounts) {
      try {
        await this.renewSubscriptionForAccount(account);
      } catch (err: any) {
        this.logger.error({
          event: 'outlook_subscription_renewal_error',
          userId: account.userId,
          error: err?.message,
        });
      }
    }
  }

  private async renewSubscriptionForAccount(account: any): Promise<void> {
    const validAccount = await this.getValidAccount(account.userId);
    const client = this.getGraphClient(validAccount.accessToken);

    // Outlook subscriptions can be extended by at most 4096 minutes
    const newExpiry = new Date(Date.now() + 4096 * 60 * 1000);

    try {
      await client.api(`/subscriptions/${account.subscriptionId}`).patch({
        expirationDateTime: newExpiry.toISOString(),
      });

      await this.repo.updateMicrosoftAccount(account.userId, {
        subscriptionExpiry: newExpiry,
      });

      this.logger.log({
        event: 'outlook_subscription_renewed',
        userId: account.userId,
        subscriptionId: account.subscriptionId,
        newExpiry: newExpiry.toISOString(),
      });
    } catch (err: any) {
      this.logger.warn({
        event: 'outlook_subscription_renewal_patch_failed',
        userId: account.userId,
        subscriptionId: account.subscriptionId,
        error: err?.message,
      });

      // Subscription may have already expired — re-create it
      await this.createMailSubscription(account.userId);
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
        scope: process.env.MICROSOFT_SCOPES as string,
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

  /**
   * Convert a plain-text string (with \n line breaks) into an HTML email body.
   *
   * The Graph API `comment` field and `contentType: 'Text'` both collapse \n into
   * spaces when Outlook renders the message as HTML. Converting to HTML with <br>
   * tags ensures the greeting / body / signature spacing is preserved.
   *
   * Strategy: blank lines (\n\n) denote paragraph breaks; lines within the same
   * paragraph are joined with <br>. Each paragraph gets a small bottom margin only
   * (no top margin) so the spacing feels natural rather than exaggerated.
   */
  private static plainTextToHtml(text: string): string {
    const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    const escaped = normalised.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const blocks = escaped
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .map((block) => {
        const inner = block.replace(/\n/g, '<br>');
        return `<p style="margin:0 0 10px 0;">${inner}</p>`;
      });

    return `<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#222;margin:0;padding:0;">${blocks.join('')}</body></html>`;
  }
}
