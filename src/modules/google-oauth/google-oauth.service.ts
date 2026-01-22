import { google } from 'googleapis';
import { simpleParser } from 'mailparser';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleAccount } from './types/google-account.interface';
import { EmailPipelineService } from '../email-pipeline/email-pipeline.service';
import { GoogleOauthRepository } from 'src/database/repos/google-oauth.repository';
import { EmailEntity } from 'src/database/schema';

@Injectable()
export class GoogleOauthService {
  constructor(
    private readonly repo: GoogleOauthRepository,
    private readonly configService: ConfigService,
    private readonly emailPipelineService: EmailPipelineService,
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

  async replyToGmailThread(
    userId: string,
    to: string,
    subject: string,
    message: string,
    threadId: string,
  ) {
    const gmail = await this.getGmailClient(userId);

    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['Message-ID'],
    });

    const lastMessage = thread.data.messages?.slice(-1)[0];
    const headers = lastMessage?.payload?.headers || [];

    // Case-insensitive search for Message-ID (can be "Message-ID" or "Message-Id")
    const messageId = headers.find((h) => h.name?.toLowerCase() === 'message-id')?.value;

    if (!messageId) {
      throw new Error('Message-ID not found for thread');
    }

    // Detect if message contains HTML
    const isHtml = this.containsHtml(message);
    const contentType = isHtml ? 'text/html; charset="utf-8"' : 'text/plain; charset="utf-8"';

    const raw = [
      `To: ${to}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      `Content-Type: ${contentType}`,
      '',
      message,
    ].join('\n');

    const encoded = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
        threadId,
      },
    });
  }

  async checkThreadExists(userId: string, threadId: string): Promise<boolean> {
    try {
      const gmail = await this.getGmailClient(userId);
      await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'minimal',
      });
      return true;
    } catch (error: any) {
      // Thread doesn't exist or was deleted
      if (error.code === 404 || error.message?.includes('not found')) {
        return false;
      }
      // Other errors should be thrown
      throw error;
    }
  }

  async sendStandaloneEmail(userId: string, to: string, subject: string, message: string) {
    const gmail = await this.getGmailClient(userId);

    // Detect if message contains HTML
    const isHtml = this.containsHtml(message);
    const contentType = isHtml ? 'text/html; charset="utf-8"' : 'text/plain; charset="utf-8"';

    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}`,
      '',
      message,
    ].join('\n');

    const encoded = Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encoded,
      },
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
    if (!account) {
      return;
    }

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

    const latestHistoryId = historyRes?.data?.historyId || newHistoryId;

    for (const msgRef of messages) {
      try {
        const messageDetails = await gmail.users.messages.get({
          userId: 'me',
          id: msgRef.id,
          format: 'raw',
        });

        const msg = messageDetails.data;
        const gmailLabels = msg.labelIds || [];
        const irrelevantLabels = [
          'SPAM',
          'DRAFT',
          'TRASH',
          'CATEGORY_FORUMS',
          'CATEGORY_SOCIAL',
          'CATEGORY_UPDATES',
          'CATEGORY_PROMOTIONS',
        ];

        if (gmailLabels.some((label) => irrelevantLabels.includes(label))) {
          continue;
        }

        const snippet = msg.snippet || null;

        const { text, html, headers } = await this.parseGmailMessageBody(msg);

        const rawBody = text || html || snippet;
        const body = this.extractNewContent(rawBody);

        if (!this.isLikelyCustomerEmail(body)) {
          console.log('Skipping - not likely customer email:', msg.id);
          console.log('Skipped Email body:', body);
          continue;
        }

        const messageId = msg.id;
        const threadId = msg.threadId as string;

        const from = this.extractEmailAddress(headers?.['from']) || null;
        const to = this.extractEmailAddress(headers?.['to']) || null;
        const cc = this.extractEmailAddress(headers?.['cc']) || null;
        const subject = headers?.['subject'] || null;
        const internalDate = msg.internalDate ? new Date(Number(msg.internalDate)) : null;
        const thread = await this.repo.upsertThread(account.userId, threadId, subject);
        const emailSentLabel = 'SENT';
        const isIncomingEmail = gmailLabels[0] !== emailSentLabel;

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
          status: isIncomingEmail ? 'processing' : 'default_sent',
          direction: isIncomingEmail ? 'incoming' : 'outgoing',
        };

        const { inserted, insertedEmail } = await this.repo.insertEmailIfNotExists(emailPayload);

        if (inserted && insertedEmail && isIncomingEmail) {
          console.log('Triggering email pipeline for:', insertedEmail.id);
          await this.triggerEmailPipeline(insertedEmail);
        } else {
          console.log('Email already exists or is outgoing, skipping pipeline:', messageId);
        }
      } catch (err) {
        console.error('Failed to process message ' + msgRef.id, err?.message || err);
      }
    }

    await this.repo.updateGoogleAccount(account.userId, {
      lastHistoryId: latestHistoryId,
    });
  }

  async parseGmailMessageBody(
    gmailMessageData: any,
  ): Promise<{ text?: string; html?: string; headers?: any }> {
    const raw = gmailMessageData.raw || gmailMessageData.rawMessage;

    if (raw) {
      const buffer = Buffer.from(this.base64UrlToBase64(raw), 'base64');
      const parsed = await simpleParser(buffer);

      // Convert headers to a key-value object
      const headersObj: any = {};
      if (parsed.headers) {
        for (const [key, value] of parsed.headers) {
          headersObj[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
        }
      }

      return {
        text: parsed.text || undefined,
        html: parsed.html || undefined,
        headers: headersObj,
      };
    }

    try {
      const payloadHeaders = (gmailMessageData.payload?.headers || [])
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
        const rawMime = `${payloadHeaders}\r\n\r\n` + bodyBuffer.toString('utf8');
        const parsed = await simpleParser(rawMime);

        // Convert headers to a key-value object
        const headersObj: any = {};
        if (parsed.headers) {
          for (const [key, value] of parsed.headers) {
            headersObj[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
          }
        }

        return {
          text: parsed.text || undefined,
          html: parsed.html || undefined,
          headers: headersObj,
        };
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

  private extractNewContent(body: string | null): string | null {
    if (!body) return null;

    let text = body;

    // Remove HTML blockquote elements (common in email threads)
    text = text.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');

    // Remove Gmail quote divs
    text = text.replace(/<div class="gmail_quote"[\s\S]*?<\/div>/gi, '');

    // Multiple quote patterns to detect where quoted content starts
    const quotePatterns = [
      /On .+? wrote:/i, // Gmail: "On Jan 22, 2024, John wrote:"
      /On .+?,? .+? <.+?> wrote:/i, // Gmail with email: "On Mon, Jan 22, 2024, John <john@email.com> wrote:"
      /From:.+?Sent:.+?To:/s, // Outlook format
      /_{10,}/, // Yahoo separator (10+ underscores)
      /-{5,} ?Forwarded message ?-{5,}/i, // Forwarded message
      /-{5,} ?Original [Mm]essage ?-{5,}/i, // Original message
      /\n> .+/m, // Lines starting with > (quoted text)
      /^>+ /m, // Start of line with > quote markers
    ];

    // Try each pattern and extract content before the quote
    for (const pattern of quotePatterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        text = text.substring(0, match.index).trim();
        break;
      }
    }

    // Remove individual quoted lines (starting with >)
    const lines = text
      .split('\n')
      .filter((line) => !line.trim().startsWith('>'))
      .join('\n')
      .trim();

    return lines || null;
  }

  private isHtmlHeavy(body: any): boolean {
    if (!body) return false;

    const lower = body.toLowerCase();

    // Check for marketing/newsletter email indicators
    const marketingIndicators = [
      /<table/gi,
      /<img[^>]+src/gi,
      /unsubscribe/i,
      /<style/gi,
      /mso-/i, // Microsoft Office HTML
      /tracking[\-_]?pixel/i,
      /utm_source/i, // UTM tracking parameters
      /mailchimp/i,
      /sendgrid/i,
    ];

    let indicatorCount = 0;
    for (const indicator of marketingIndicators) {
      const matches = lower.match(indicator);
      if (matches) {
        indicatorCount += matches.length;
      }
    }

    // If multiple marketing indicators, it's heavy (marketing email)
    if (indicatorCount >= 3) return true;

    // Check tag-to-text ratio
    const tagCount = (body.match(/<[^>]+>/g) || []).length;
    const textContent = body
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const textLength = textContent.length;

    // If very few text but many tags, it's heavy
    if (textLength > 0 && tagCount > textLength / 10) return true;

    // If excessive tags regardless of content (likely complex HTML template)
    if (tagCount > 50) return true;

    // Check for excessive inline styles (common in marketing emails)
    const styleCount = (body.match(/style="/gi) || []).length;
    if (styleCount > 10) return true;

    return false;
  }

  private isLikelyCustomerEmail(body: any): boolean {
    // CRITICAL FIX: Empty body should NOT be customer email
    if (!body || typeof body !== 'string' || body.trim().length < 10) {
      return false;
    }

    const lower = body.toLowerCase();

    // Check for automated/marketing indicators (NOT customer emails)
    const automatedIndicators = [
      /unsubscribe/i,
      /click here to view/i,
      /view in browser/i,
      /<img[^>]+tracking/i,
      /pixel\.gif/i,
      /email was sent to/i,
      /you('re| are) receiving this/i,
      /update (your )?preferences/i,
      /privacy policy/i,
      /terms of service/i,
    ];

    for (const indicator of automatedIndicators) {
      if (lower.match(indicator)) {
        return false;
      }
    }

    // Check for customer email indicators
    const customerIndicators = [
      /\?/, // Questions
      /order #?\d+/i, // Order references
      /where is my/i,
      /when will/i,
      /haven'?t received/i,
      /tracking/i,
      /status/i,
      /help/i,
      /refund/i,
      /cancel/i,
      /issue/i,
      /problem/i,
      /delayed/i,
      /late/i,
      /wrong/i,
      /missing/i,
    ];

    let customerMatches = 0;
    for (const indicator of customerIndicators) {
      if (lower.match(indicator)) {
        customerMatches++;
      }
    }

    // If has strong customer indicators, likely a customer email
    if (customerMatches >= 2) return true;

    // Get text content without HTML tags
    const textContent = body
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const wordCount = textContent.split(/\s+/).length;

    // Check tag density
    const tagCount = (body.match(/<[^>]+>/g) || []).length;

    // Customer emails are typically:
    // - Short to medium length (under 500 words)
    // - Minimal HTML (less than 20 tags)
    // - At least some customer indicator present
    if (wordCount < 500 && tagCount < 20 && customerMatches >= 1) {
      return true;
    }

    // Very short plain text emails are likely customer emails
    if (wordCount < 200 && tagCount < 10) {
      return true;
    }

    return false;
  }

  private extractEmailAddress(headerValue: any): string | null {
    if (!headerValue) return null;

    // If it's already a string, return as is
    if (typeof headerValue === 'string') {
      return headerValue;
    }

    // If it's a parsed object from simpleParser, use the text field
    // This gives us the format: "Name" <email@example.com>
    if (headerValue.text) {
      return headerValue.text;
    }

    // Fallback: construct from value array if text is not available
    if (headerValue.value && Array.isArray(headerValue.value) && headerValue.value.length > 0) {
      const firstAddress = headerValue.value[0];
      if (firstAddress.name && firstAddress.address) {
        return `"${firstAddress.name}" <${firstAddress.address}>`;
      } else if (firstAddress.address) {
        return firstAddress.address;
      }
    }

    return null;
  }

  private containsHtml(message: string): boolean {
    if (!message) return false;
    // Check for common HTML tags
    const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
    return htmlTagPattern.test(message);
  }

  private async triggerEmailPipeline(email: EmailEntity) {
    setImmediate(async () => {
      try {
        await this.emailPipelineService.processEmail(email);
      } catch (error) {
        console.error(`Pipeline failed for email ${email.id}:`, error);
      }
    });
  }
}
