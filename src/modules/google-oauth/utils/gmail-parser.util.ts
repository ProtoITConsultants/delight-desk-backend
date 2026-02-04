import { Injectable } from '@nestjs/common';
import { simpleParser } from 'mailparser';

/**
 * Utility service for parsing Gmail message formats
 */
@Injectable()
export class GmailParserUtil {
  /**
   * Parse Gmail message body and extract text, HTML, and headers
   */
  async parseMessageBody(
    gmailMessageData: any,
  ): Promise<{ text?: string; html?: string; headers?: any }> {
    const raw = gmailMessageData.raw || gmailMessageData.rawMessage;

    if (raw) {
      return this.parseRawMessage(raw);
    }

    try {
      return await this.parsePayloadMessage(gmailMessageData);
    } catch (err) {
      console.error('Error parsing Gmail message:', err);
    }

    // Fallback to snippet
    return { text: gmailMessageData.snippet || undefined };
  }

  /**
   * Parse raw base64-encoded message
   */
  private async parseRawMessage(
    raw: string,
  ): Promise<{ text?: string; html?: string; headers?: any }> {
    const buffer = Buffer.from(this.base64UrlToBase64(raw), 'base64');
    const parsed = await simpleParser(buffer);

    return {
      text: parsed.text || undefined,
      html: parsed.html || undefined,
      headers: this.convertHeadersToObject(parsed.headers),
    };
  }

  /**
   * Parse message from payload structure
   */
  private async parsePayloadMessage(
    gmailMessageData: any,
  ): Promise<{ text?: string; html?: string; headers?: any }> {
    const payloadHeaders = (gmailMessageData.payload?.headers || [])
      .map((h: any) => `${h.name}: ${h.value}`)
      .join('\r\n');

    const parts = this.flattenParts(gmailMessageData.payload);
    const best =
      parts.find((p: any) => p.mimeType === 'text/plain') ||
      parts.find((p: any) => p.mimeType === 'text/html') ||
      parts[0];

    if (best && best.body && best.body.data) {
      const bodyBuffer = Buffer.from(this.base64UrlToBase64(best.body.data), 'base64');
      const rawMime = `${payloadHeaders}\r\n\r\n` + bodyBuffer.toString('utf8');
      const parsed = await simpleParser(rawMime);

      return {
        text: parsed.text || undefined,
        html: parsed.html || undefined,
        headers: this.convertHeadersToObject(parsed.headers),
      };
    }

    return {};
  }

  /**
   * Convert parsed headers Map to plain object
   */
  private convertHeadersToObject(headers: any): any {
    const headersObj: any = {};

    if (headers) {
      for (const [key, value] of headers) {
        headersObj[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    return headersObj;
  }

  /**
   * Convert base64url encoding to standard base64
   */
  base64UrlToBase64(b64u: string): string {
    let result = b64u.replace(/-/g, '+').replace(/_/g, '/');
    const pad = result.length % 4;
    if (pad) {
      result += '='.repeat(4 - pad);
    }
    return result;
  }

  /**
   * Flatten nested MIME parts into a single array
   */
  flattenParts(payload: any): any[] {
    const out: any[] = [];

    const walk = (p: any) => {
      if (!p) return;
      if (p.parts && Array.isArray(p.parts)) {
        p.parts.forEach(walk);
      } else {
        out.push(p);
      }
    };

    walk(payload);
    return out;
  }
}
