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
   * Build voice & settings instructions for AI prompts. Deterministic — same input
   * always produces the same output, so this is safe to call from inside Temporal
   * activities.
   *
   * Brand voice presets steer phrasing rather than content. Each preset spells out
   * concrete vocabulary, sentence shape, and example openers because the model
   * otherwise reverts to a generic "polite customer service rep" voice and the
   * three options end up sounding identical. Examples are kept short so they shape
   * tone without bleeding into the actual reply.
   */
  buildVoiceAndSettingsContext(aiIdentity?: any): string {
    if (!aiIdentity) return '';

    const parts: string[] = [];

    // ---- Brand Voice ----
    if (aiIdentity.brandVoice) {
      let voiceInstruction = '';
      switch (aiIdentity.brandVoice) {
        case 'friendly':
          voiceInstruction =
            'Brand voice: FRIENDLY. Write in first person ("I"), like a real person doing the customer a small favor. Use natural contractions ("I\'ve", "you\'ll", "that\'s"). Open with phrases like "I\'ve gone ahead and...", "I\'ve taken care of...", "I\'ve got you covered". Keep it warm, casual, and unfussy. Avoid corporate phrasing like "we have processed", "kindly note", "please be advised". Avoid sales language and avoid being effusive.';
          break;
        case 'professional':
          voiceInstruction =
            'Brand voice: PROFESSIONAL. Write in a polished, neutral, business-appropriate voice. Prefer "we" and the passive structure for actions taken on the customer\'s behalf — e.g., "Your refund has been issued", "We\'ve applied the code to your order", "The promotion has been honored". Be clear, concise, and respectful. Do NOT use casual filler ("no worries", "super easy", "happy to help"), do NOT use overly warm first-person phrasing ("I\'ve got you covered"), and do NOT be effusive or apologetic.';
          break;
        case 'sophisticated':
          voiceInstruction =
            'Brand voice: SOPHISTICATED. Write in an elevated, refined voice without being stiff or pretentious. Use precise word choices and measured phrasing — like a thoughtful concierge at a premium brand. Acceptable openers: "I\'ve applied your discount and processed the corresponding adjustment", "We\'ve taken care of the refund on your behalf". Use full sentences; avoid casual contractions in formal positions; avoid both overly basic phrasing ("got it", "all set") and corporate boilerplate ("kindly note", "please be advised"). Keep it composed, never breezy.';
          break;
      }
      if (voiceInstruction) parts.push(voiceInstruction);
    }

    // ---- Thank loyal customers ----
    if (aiIdentity.thankLoyalCustomers) {
      parts.push(
        'If this appears to be a repeat or loyal customer, acknowledge and thank them for their continued business — keep the acknowledgement to one short clause that fits the brand voice above.',
      );
    }

    // ---- Emoji policy ----
    if (aiIdentity.allowEmojiInResponses) {
      parts.push('You may use appropriate emojis sparingly to add warmth and personality.');
    } else {
      parts.push('Do not use emojis in your response.');
    }

    // ---- Custom instructions (free-form merchant override) ----
    if (aiIdentity.customInstructions) {
      parts.push(`Additional merchant guidelines (apply on top of the brand voice above): ${aiIdentity.customInstructions}`);
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
