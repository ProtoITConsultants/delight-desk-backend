import { Injectable } from '@nestjs/common';

/**
 * Message Formatting Helper
 *
 * Contains deterministic utility methods for formatting messages.
 * These are NOT activities because they don't perform non-deterministic operations
 * (no external API calls, no database queries, no AI calls).
 */
@Injectable()
export class MessageFormattingHelper {
  /**
   * Build voice & settings instructions for AI prompts
   * This is deterministic - same input always produces same output
   */
  buildVoiceAndSettingsContext(aiIdentity?: any): string {
    if (!aiIdentity) return '';

    const parts: string[] = [];

    // Brand Voice
    if (aiIdentity.brandVoice) {
      let voiceInstruction = '';
      switch (aiIdentity.brandVoice) {
        case 'friendly':
          voiceInstruction =
            'Use a warm, approachable, and conversational tone. Be personable and relatable while maintaining professionalism.';
          break;
        case 'professional':
          voiceInstruction =
            'Use a polished, business-appropriate tone. Be clear, concise, and respectful while maintaining warmth.';
          break;
        case 'sophisticated':
          voiceInstruction =
            'Use an elevated, refined tone. Be articulate and well-composed while remaining accessible and helpful.';
          break;
        case 'custom':
          if (aiIdentity.customBrandVoice) {
            voiceInstruction = `Brand Voice: ${aiIdentity.customBrandVoice}`;
          }
          break;
      }
      if (voiceInstruction) parts.push(voiceInstruction);
    }

    // Industry-specific guidance
    if (aiIdentity.industrySpecificGuidance && aiIdentity.businessType) {
      parts.push(
        `Apply ${aiIdentity.businessType} industry best practices and terminology in your response.`,
      );
    }

    // Thank loyal customers
    if (aiIdentity.thankLoyalCustomers) {
      parts.push(
        'If this appears to be a repeat customer or loyal customer, acknowledge and thank them for their continued business.',
      );
    }

    // Emoji policy
    if (aiIdentity.allowEmojiInResponses) {
      parts.push('You may use appropriate emojis sparingly to add warmth and personality.');
    } else {
      parts.push('Do not use emojis in your response.');
    }

    // Custom instructions
    if (aiIdentity.customInstructions) {
      parts.push(`Additional Guidelines: ${aiIdentity.customInstructions}`);
    }

    return parts.length > 0 ? `\n\n**Voice & Behavior Guidelines:**\n${parts.join('\n')}` : '';
  }

  /**
   * Format email messages with AI identity (salutation and signature)
   * This is deterministic - same inputs always produce same output
   */
  formatMessageWithAiIdentity(
    messageContent: string,
    customerName: string,
    aiIdentity?: any,
  ): string {
    const salutation = aiIdentity?.emailSalutation || 'Hi';

    // Build salutation
    const greeting = `${salutation} ${customerName},\n\n`;
    const signature = this.buildSignatureFromAiIdentity(aiIdentity);

    return `${greeting}${messageContent}${signature}`;
  }

  /**
   * Build dynamic signature block based on AI identity settings.
   */
  buildSignatureFromAiIdentity(aiIdentity?: any): string {
    const agentName = aiIdentity?.aiAgentName || '';
    const agentTitle = aiIdentity?.aiAgentTitle || '';
    const companyName = aiIdentity?.companyNameForEmailSignature || '';
    const signatureFooter = aiIdentity?.signatureFooter || '';

    let signature = '\n\n';
    if (agentName) {
      signature += agentName;
      if (companyName || agentTitle) {
        signature += '\n';
      }
    }
    if (agentTitle) {
      signature += agentTitle;
      if (companyName) {
        signature += '\n';
      }
    }
    if (companyName) {
      signature += companyName;
    }
    if (signatureFooter) {
      signature += `\n\n${signatureFooter}`;
    }

    return signature;
  }

  /**
   * Strip markdown link syntax [text](url) -> url from plain-text email content.
   * Prevents raw markdown slugs from appearing in Gmail when the AI uses markdown formatting.
   */
  stripMarkdownLinks(text: string): string {
    // Replace [label](url) with just the url
    return text.replace(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, '$2');
  }

  /**
   * Extract customer name from email address
   * This is deterministic - same email always produces same name
   */
  extractCustomerName(email: string): string {
    // Extract name from "John Doe <john@example.com>" format
    const match = email.match(/^"?([^"<]+)"?\s*<?/);
    if (match && match[1]) {
      const name = match[1].trim();
      // If it looks like a name (not an email), return it
      if (!name.includes('@')) {
        return name;
      }
    }

    // Fallback: Extract from email address (john.doe@example.com -> John Doe)
    const emailMatch = email.match(/([^@<\s]+)@/);
    if (emailMatch && emailMatch[1]) {
      const username = emailMatch[1];
      // Convert "john.doe" or "john_doe" to "John Doe"
      return username
        .split(/[._-]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    }

    return 'there'; // Fallback generic greeting
  }
}
