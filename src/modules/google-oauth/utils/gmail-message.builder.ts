import { Injectable } from '@nestjs/common';
import { CONTENT_TYPES } from '../constants/gmail.constants';

export interface EmailMessage {
  to: string;
  subject: string;
  message: string;
  isHtml: boolean;
}

export interface ReplyMessage extends EmailMessage {
  messageId: string;
  threadId: string;
}

/**
 * Utility for building and encoding Gmail messages
 */
@Injectable()
export class GmailMessageBuilder {
  /**
   * Build and encode a standalone email message
   */
  buildStandaloneEmail(to: string, subject: string, message: string, isHtml: boolean): string {
    const contentType = isHtml ? CONTENT_TYPES.HTML : CONTENT_TYPES.PLAIN;

    const raw = [
      `To: ${to}`,
      `Subject: ${subject}`,
      `Content-Type: ${contentType}`,
      '',
      message,
    ].join('\n');

    return this.encodeMessage(raw);
  }

  /**
   * Build and encode a reply to an existing thread
   */
  buildReplyEmail(
    to: string,
    subject: string,
    message: string,
    messageId: string,
    isHtml: boolean,
  ): string {
    const contentType = isHtml ? CONTENT_TYPES.HTML : CONTENT_TYPES.PLAIN;

    const raw = [
      `To: ${to}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      `Content-Type: ${contentType}`,
      '',
      message,
    ].join('\n');

    return this.encodeMessage(raw);
  }

  /**
   * Encode message to base64url format for Gmail API
   */
  private encodeMessage(raw: string): string {
    return Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
