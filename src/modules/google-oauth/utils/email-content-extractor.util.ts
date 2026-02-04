import { Injectable } from '@nestjs/common';
import { EMAIL_QUOTE_PATTERNS } from '../constants/gmail.constants';

/**
 * Utility service for extracting and cleaning email content
 */
@Injectable()
export class EmailContentExtractorUtil {
  /**
   * Extract new content from email, removing quoted replies and signatures
   */
  extractNewContent(body: string | null): string | null {
    if (!body) return null;

    let text = body;

    // Remove HTML blockquote elements (common in email threads)
    text = text.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '');

    // Remove Gmail quote divs
    text = text.replace(/<div class="gmail_quote"[\s\S]*?<\/div>/gi, '');

    // Try each pattern and extract content before the quote
    for (const pattern of EMAIL_QUOTE_PATTERNS) {
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

  /**
   * Extract email address from various header formats
   */
  extractEmailAddress(headerValue: any): string | null {
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

  /**
   * Detect if message contains HTML
   */
  containsHtml(message: string): boolean {
    if (!message) return false;

    const htmlTagPattern = /<\/?[a-z][\s\S]*>/i;
    return htmlTagPattern.test(message);
  }

  /**
   * Get text content without HTML tags
   */
  stripHtmlTags(content: string): string {
    return content
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Count HTML tags in content
   */
  countHtmlTags(content: string): number {
    const matches = content.match(/<[^>]+>/g);
    return matches ? matches.length : 0;
  }

  /**
   * Count words in text
   */
  countWords(text: string): number {
    const stripped = this.stripHtmlTags(text);
    return stripped.split(/\s+/).length;
  }
}
