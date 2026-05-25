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
   * Convert a plain-text string (with \n line breaks) into an HTML email body.
   *
   * Blank lines (\n\n) become paragraph breaks; single \n within a block becomes
   * <br>. Each paragraph gets a small bottom margin only so spacing feels natural.
   * Already-HTML content is returned unchanged.
   */
  static plainTextToHtml(text: string): string {
    if (!text) return '';

    const htmlDocumentPattern = /<!doctype html|<html[\s>]|<body[\s>]/i;
    if (htmlDocumentPattern.test(text)) {
      return text;
    }

    const htmlFragmentPattern = /<\/?[a-z][^>]*>/i;
    if (htmlFragmentPattern.test(text)) {
      return GmailMessageBuilder.wrapInEmailShell(text);
    }

    const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    const escaped = normalised
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const blocks = escaped
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0)
      .map((block) => {
        const inner = block.replace(/\n/g, '<br>');
        return `<p style="margin:0 0 10px 0;">${inner}</p>`;
      });

    return GmailMessageBuilder.wrapInEmailShell(blocks.join(''));
  }

  private static wrapInEmailShell(content: string): string {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="x-apple-disable-message-reformatting"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0;padding:0;width:100%;background:#ffffff;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222222;font-size:16px;line-height:1.6;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;width:100%;"><tr><td style="padding:0;"><div style="max-width:680px;margin:0 auto;padding:0;font-size:16px;line-height:1.6;">${content}</div></td></tr></table></body></html>`;
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
