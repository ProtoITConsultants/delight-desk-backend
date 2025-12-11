import { google } from 'googleapis';
import { simpleParser } from 'mailparser';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAccount } from './types/google-account.interface';
import { GoogleOauthRepository } from 'src/database/repos/google-oauth.repository';

@Injectable()
export class GoogleOauthService {
  constructor(
    private readonly repo: GoogleOauthRepository,
    private readonly configService: ConfigService,
  ) {}

  async accountExists(userId: string) {
    return await this.repo.accountExists(userId);
  }

  async connectGoogleAccount(userId: string, googleAccount: GoogleAccount, scopes: []) {
    await this.repo.removeExistingAccount(userId);
    await this.repo.addGoogleAccount(userId, googleAccount, scopes);
  }

  async disconnectGoogleAccount(userId: string) {
    return await this.repo.removeExistingAccount(userId);
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
        accessToken: credentials.access_token as any,
        expiresAt: new Date(credentials.expiry_date as any),
      });

      oauth2Client.setCredentials(credentials);
    }

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  async watchGmail(userId: string) {
    const gmail = await this.getGmailClient(userId);

    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: this.configService.get('GOOGLE_PUBSUB_TOPIC_NAME'),
      },
    });

    const lastHistoryId = res.data.historyId;
    await this.repo.updateGoogleAccount(userId, { lastHistoryId });
  }

  async sendEmail(
    userId: string,
    { to, subject, message }: { to: string; subject: string; message: string },
  ) {
    const gmail = await this.getGmailClient(userId);

    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="utf-8"',
      '',
      message,
    ].join('\n');

    const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });

    return { success: true };
  }

  async markEmailAsRead(userId: string, messageId: string): Promise<{ success: boolean }> {
    const gmail = await this.getGmailClient(userId);

    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });

    return { success: true };
  }

  async processNewEmails(email: string, newHistoryId: string | number) {
    const account = await this.repo.getGoogleAccountByEmail(email);
    const gmail = await this.getGmailClient(account.userId);
    const startHistoryId = account.lastHistoryId ? account.lastHistoryId.toString() : null;

    let historyRes: any = null;
    try {
      if (startHistoryId) {
        historyRes = await gmail.users.history.list({
          userId: 'me',
          startHistoryId,
          historyTypes: ['messageAdded'],
        });
      } else {
        const listRes = await gmail.users.messages.list({
          userId: 'me',
          labelIds: ['INBOX'],
          maxResults: 1,
        });
        const msgIds = listRes.data.messages || [];
        historyRes = { fullSync: true, messages: msgIds.map((m: any) => ({ id: m.id })) };
      }
    } catch (err: any) {
      console.error(err);
      return;
    }

    const messages: any[] =
      historyRes?.data?.history?.flatMap((h: any) => h.messages) || historyRes?.messages || [];

    for (const msgRef of messages) {
      try {
        const messageDetails = await gmail.users.messages.get({
          userId: 'me',
          id: msgRef.id,
          format: 'full',
        });

        const msg = messageDetails.data;

        const gmailLabels = msg.labelIds || [];

        console.log({ gmailLabels });

        const irrelevantLabels = [
          'SPAM',
          'TRASH',
          'CATEGORY_PROMOTIONS',
          'CATEGORY_SOCIAL',
          'CATEGORY_UPDATES',
          'CATEGORY_FORUMS',
        ];

        if (gmailLabels.some((label) => irrelevantLabels.includes(label))) {
          continue;
        }

        const messageId = msg.id;
        const threadId = msg.threadId as string;
        const headers = (msg.payload?.headers || []).reduce(
          (acc: any, h: any) => ({ ...acc, [h.name.toLowerCase()]: h.value }),
          {},
        );

        const from = headers['from'] || null;
        const to = headers['to'] || null;
        const cc = headers['cc'] || null;
        const subject = headers['subject'] || null;
        const internalDate = msg.internalDate ? new Date(Number(msg.internalDate)) : null;
        const snippet = msg.snippet || null;

        const { text, html } = await this.parseGmailMessageBody(msg);
        const rawBody = html || text || snippet;
        const body = this.extractLatestReply(rawBody);

        if (this.isHtmlHeavy(body) || !this.isLikelyCustomerEmail(body)) {
          return;
        }

        const thread = await this.repo.upsertThread(account.userId, threadId, subject);

        const emailPayload = {
          messageId: messageId,
          threadId: thread.id,
          userId: account.userId,
          fromEmail: from,
          toEmail: to,
          cc,
          snippet,
          subject,
          body,
          internalDate: internalDate as any,
        };

        console.log('Email Payload: ', emailPayload);

        const { inserted } = await this.repo.insertEmailIfNotExists(emailPayload);
        if (inserted) {
        }
      } catch (err) {
        console.error('Failed to process message ' + msgRef.id, err?.message || err);
      }
    }

    await this.repo.updateGoogleAccount(account.userId, {
      lastHistoryId: newHistoryId,
    });
  }

  async parseGmailMessageBody(gmailMessageData: any): Promise<{ text?: string; html?: string }> {
    const raw = gmailMessageData.raw || gmailMessageData.rawMessage;

    if (raw) {
      const buffer = Buffer.from(this.base64UrlToBase64(raw), 'base64');
      const parsed = await simpleParser(buffer);
      return { text: parsed.text || undefined, html: parsed.html || undefined };
    }

    try {
      const headers = (gmailMessageData.payload?.headers || [])
        .map((h: any) => `${h.name}: ${h.value}`)
        .join('\r\n');
      const parts = this.flattenParts(gmailMessageData.payload);
      const best =
        parts.find((p: any) => p.mimeType === 'text/plain') ||
        parts.find((p: any) => p.mimeType === 'text/html') ||
        parts[0];

      let bodyBuffer: Buffer;

      if (best && best.body && best.body.data) {
        bodyBuffer = Buffer.from(this.base64UrlToBase64(best.body.data), 'base64');
        const rawMime = `${headers}\r\n\r\n` + bodyBuffer.toString('utf8');
        const parsed = await simpleParser(rawMime);
        return { text: parsed.text || undefined, html: parsed.html || undefined };
      }
    } catch (err) {
      console.error(err);
    }

    return { text: gmailMessageData.snippet || undefined };
  }

  base64UrlToBase64(b64u: string) {
    b64u = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64u.length % 4;
    if (pad) b64u += '='.repeat(4 - pad);
    return b64u;
  }

  flattenParts(payload: any): any[] {
    const out: any[] = [];
    function walk(p: any) {
      if (!p) return;
      if (p.parts && Array.isArray(p.parts)) {
        p.parts.forEach(walk);
      } else {
        out.push(p);
      }
    }
    walk(payload);
    return out;
  }

  private extractLatestReply(body: string | null): string | null {
    if (!body) return null;

    // Decode HTML entities
    const decoded = body
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');

    // Pattern to match Gmail quote headers: "On [date] at [time] [name] <email> wrote:"
    const quotePattern = /On .+? at .+? .+? <.+?> wrote:/i;

    // Split on the first quote header to get just the latest message
    const parts = decoded.split(quotePattern);

    // The first part is the newest content
    let latest = parts[0].trim();

    // Also remove lines that start with '>' (common quote marker)
    const lines = latest
      .split('\n')
      .filter((line) => !line.trim().startsWith('>'))
      .join('\n')
      .trim();

    return lines || null;
  }

  private isHtmlHeavy(body: any) {
    if (!body) return false;

    const lower = body.toLowerCase();

    const heavyTags = ['<table', '<td', '<tr', '<style', 'font-size', 'color:', '<div', '<span'];

    const tagCount = (body.match(/<[^>]+>/g) || []).length;

    return tagCount > 10 || heavyTags.some((t) => lower.includes(t));
  }

  private isLikelyCustomerEmail(body: any) {
    if (!body) return true;
    const tagCount = (body.match(/<[^>]+>/g) || []).length;
    return tagCount < 5;
  }
}
