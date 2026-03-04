import { Injectable } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { GmailMessageBuilder } from '../utils/gmail-message.builder';
import { GMAIL_API } from '../constants/gmail.constants';

/**
 * Service for Gmail API operations (send, reply, mark as read, etc.)
 */
@Injectable()
export class GmailService {
  constructor(private readonly messageBuilder: GmailMessageBuilder) {}

  /**
   * Reply to an existing Gmail thread
   */
  async replyToThread(
    gmail: gmail_v1.Gmail,
    to: string,
    subject: string,
    message: string,
    threadId: string,
  ): Promise<void> {
    // Get the thread to find the Message-ID header
    const thread = await gmail.users.threads.get({
      userId: GMAIL_API.USER_ID,
      id: threadId,
      format: GMAIL_API.FORMAT_METADATA,
      metadataHeaders: ['Message-ID'],
    });

    const lastMessage = thread.data.messages?.slice(-1)[0];
    const headers = lastMessage?.payload?.headers || [];

    // Case-insensitive search for Message-ID
    const messageId = headers.find((h) => h.name?.toLowerCase() === 'message-id')?.value;

    if (!messageId) {
      throw new Error('Message-ID not found for thread');
    }

    // Always send as HTML — convert plain text to HTML so \n line breaks are
    // preserved. Already-HTML content passes through unchanged.
    const htmlBody = GmailMessageBuilder.plainTextToHtml(message);
    const encoded = this.messageBuilder.buildReplyEmail(to, subject, htmlBody, messageId, true);

    // Send the reply
    await gmail.users.messages.send({
      userId: GMAIL_API.USER_ID,
      requestBody: {
        raw: encoded,
        threadId,
      },
    });
  }

  /**
   * Send a standalone email (not a reply)
   */
  async sendStandaloneEmail(
    gmail: gmail_v1.Gmail,
    to: string,
    subject: string,
    message: string,
  ): Promise<{ success: boolean }> {
    // Always send as HTML — convert plain text to HTML so \n line breaks are
    // preserved. Already-HTML content passes through unchanged.
    const htmlBody = GmailMessageBuilder.plainTextToHtml(message);
    const encoded = this.messageBuilder.buildStandaloneEmail(to, subject, htmlBody, true);

    // Send the email
    await gmail.users.messages.send({
      userId: GMAIL_API.USER_ID,
      requestBody: {
        raw: encoded,
      },
    });

    return { success: true };
  }

  /**
   * Mark an email as read
   */
  async markAsRead(gmail: gmail_v1.Gmail, messageId: string): Promise<{ success: boolean }> {
    await gmail.users.messages.modify({
      userId: GMAIL_API.USER_ID,
      id: messageId,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });

    return { success: true };
  }

  /**
   * Check if a thread exists
   */
  async threadExists(gmail: gmail_v1.Gmail, threadId: string): Promise<boolean> {
    try {
      await gmail.users.threads.get({
        userId: GMAIL_API.USER_ID,
        id: threadId,
        format: GMAIL_API.FORMAT_MINIMAL,
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
}
