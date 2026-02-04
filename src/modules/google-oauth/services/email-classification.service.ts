import { Injectable } from '@nestjs/common';
import {
  AUTOMATED_EMAIL_PATTERNS,
  CUSTOMER_EMAIL_PATTERNS,
  EMAIL_CLASSIFICATION_THRESHOLDS,
} from '../constants/gmail.constants';
import { EmailContentExtractorUtil } from '../utils/email-content-extractor.util';

/**
 * Service for classifying emails (customer vs automated/marketing)
 */
@Injectable()
export class EmailClassificationService {
  constructor(private readonly contentExtractor: EmailContentExtractorUtil) {}

  /**
   * Determine if an email is likely from a customer (vs automated/marketing)
   */
  isLikelyCustomerEmail(body: any): boolean {
    // CRITICAL: Empty body should NOT be customer email
    if (
      !body ||
      typeof body !== 'string' ||
      body.trim().length < EMAIL_CLASSIFICATION_THRESHOLDS.MIN_BODY_LENGTH
    ) {
      return false;
    }

    const lower = body.toLowerCase();

    // Check for automated/marketing indicators (NOT customer emails)
    if (this.hasAutomatedIndicators(lower)) {
      return false;
    }

    // Count customer email indicators
    const customerMatches = this.countCustomerIndicators(lower);

    // Strong customer indicators = definitely customer email
    if (customerMatches >= EMAIL_CLASSIFICATION_THRESHOLDS.MIN_CUSTOMER_MATCHES) {
      return true;
    }

    // Analyze content characteristics
    const wordCount = this.contentExtractor.countWords(body);
    const tagCount = this.contentExtractor.countHtmlTags(body);

    // Customer emails are typically:
    // - Short to medium length (under 500 words)
    // - Minimal HTML (less than 20 tags)
    // - At least some customer indicator present
    if (
      wordCount < EMAIL_CLASSIFICATION_THRESHOLDS.MEDIUM_EMAIL_WORD_COUNT &&
      tagCount < EMAIL_CLASSIFICATION_THRESHOLDS.CUSTOMER_EMAIL_TAG_COUNT &&
      customerMatches >= 1
    ) {
      return true;
    }

    // Very short plain text emails are likely customer emails
    if (
      wordCount < EMAIL_CLASSIFICATION_THRESHOLDS.SHORT_EMAIL_WORD_COUNT &&
      tagCount < EMAIL_CLASSIFICATION_THRESHOLDS.PLAIN_TEXT_TAG_COUNT
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check if email contains automated/marketing indicators
   */
  private hasAutomatedIndicators(lowerCaseBody: string): boolean {
    for (const indicator of AUTOMATED_EMAIL_PATTERNS) {
      if (lowerCaseBody.match(indicator)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Count how many customer email patterns are present
   */
  private countCustomerIndicators(lowerCaseBody: string): number {
    let count = 0;

    for (const indicator of CUSTOMER_EMAIL_PATTERNS) {
      if (lowerCaseBody.match(indicator)) {
        count++;
      }
    }

    return count;
  }
}
