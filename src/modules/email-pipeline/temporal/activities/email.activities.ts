import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import type { EmailEntity } from 'src/database/schema/email.schema';
import { WooCommerceRestApiService } from '../../../woocommerce/woocommerce-rest-api.service';
import { AftershipService } from '../../../aftership/aftership.service';
import { Tracking } from '@aftership/tracking-sdk/dist/model/Tracking';
import { GoogleOauthService } from '../../../google-oauth/google-oauth.service';
import { AgentsService } from '../../../agents/agents.service';
import { OrderDetails, OrderExtractionResult } from '../../types';
import { AiAssistantService } from 'src/modules/ai-assistant/ai-assistant.service';
import { EmailThreadsRepository } from 'src/database/repos/email-threads.repository';
import { ApprovalQueueRepository } from 'src/database/repos/approval-queue.repository';
import { ApprovalQueueActionsRepository } from 'src/database/repos/approval-queue-actions.repository';
import { AiIdentityRepository } from 'src/database/repos/ai-identity.repository';

@Injectable()
@Activity()
export class EmailActivities {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly aftershipService: AftershipService,
    private readonly googleOAuthService: GoogleOauthService,
    private readonly aiAssistantService: AiAssistantService,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
    private readonly emailThreadsRepository: EmailThreadsRepository,
    private readonly approvalQueueRepository: ApprovalQueueRepository,
    private readonly approvalQueueActionsRepository: ApprovalQueueActionsRepository,
    private readonly aiIdentityRepository: AiIdentityRepository,
  ) {}

  @ActivityMethod({ name: 'extractOrderNumberFromEmail' })
  extractOrderNumberFromEmail(email: EmailEntity): Promise<OrderExtractionResult> {
    return this.agentsService.extractOrderNumber(email);
  }

  @ActivityMethod({ name: 'getMostRecentOrderByEmail' })
  getMostRecentOrderByEmail(userId: string, email: string): Promise<any> {
    return this.wooCommerceRestApiService.getMostRecentOrderByEmail(userId, email);
  }

  @ActivityMethod({ name: 'getWooCommerceOrderById' })
  getWooCommerceOrderById(userId: string, orderId: string): Promise<OrderDetails> {
    return this.wooCommerceRestApiService.getOrderById(userId, orderId);
  }

  @ActivityMethod({ name: 'createAfterShipTracking' })
  createAfterShipTracking(
    trackingNumber: string,
    carrierSlug: string,
    orderId: number,
  ): Promise<Tracking> {
    return this.aftershipService.createTracking(trackingNumber, carrierSlug, orderId);
  }

  @ActivityMethod({ name: 'fetchAfterShipStatus' })
  fetchAfterShipStatus(trackingNumber: string): Promise<Tracking> {
    return this.aftershipService.getTrackingById(trackingNumber);
  }

  @ActivityMethod({ name: 'sendCustomerNotificationViaGmailThread' })
  async sendCustomerNotificationViaGmailThread(
    userId: string,
    to: string,
    subject: string,
    message: string,
    threadId: string,
  ): Promise<any> {
    // Fetch the email thread from database to get the Gmail thread ID
    const emailThread = await this.emailThreadsRepository.findById(threadId);

    if (!emailThread) {
      throw new Error(`Email thread not found: ${threadId}`);
    }

    // Use the Gmail thread ID from the database record
    return this.googleOAuthService.replyToGmailThread(
      userId,
      to,
      subject,
      message,
      emailThread.threadId,
    );
  }

  @ActivityMethod({ name: 'getUserAgentSettings' })
  async getUserAgentSettings(
    userId: string,
    agentType: string,
  ): Promise<{
    isEnabled: boolean | undefined;
    requiresModeration: boolean | undefined;
  }> {
    const userAgents = await this.agentsService.getAgentsForUser(userId);
    const currentAgent = userAgents.find((agent) => agent.type === agentType);
    return {
      isEnabled: currentAgent?.isEnabled,
      requiresModeration: currentAgent?.requiresModeration,
    };
  }

  @ActivityMethod({ name: 'getAiIdentity' })
  async getAiIdentity(userId: string): Promise<any> {
    return this.aiIdentityRepository.findByUserId(userId);
  }

  @ActivityMethod({ name: 'generateAcknowledgementMessage' })
  async generateAcknowledgementMessage(
    orderNumber: string,
    customerName: string,
    customerQuery: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
      Generate a brief, friendly acknowledgement email for a customer who inquired about their order status.

      Order Number: ${orderNumber}
      Customer Name: ${customerName}
      Customer's Question: ${customerQuery}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a warm acknowledgement that:
      1. Thanks the customer for reaching out
      2. Confirms we received their inquiry about order #${orderNumber}
      3. Lets them know we're looking into it and will provide an update soon
      4. Sets a positive, reassuring tone
      5. Keeps it under 100 tokens
      6. Do not include a salutation (like "Hi" or "Hello") at the beginning
      7. Do not include a signature or sign-off at the end
${voiceContext}

      Important: This is just an acknowledgement, not the final response. Keep it brief and reassuring.
    `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} acknowledging customer inquiries.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.7;

    const response = await this.agentsService['openaiService'].createChatCompletion(
      messages,
      temperature,
    );

    const messageContent = response.choices[0].message.content || '';

    // Format the message with AI identity
    return this.formatMessageWithAiIdentity(messageContent, customerName, aiIdentity);
  }

  @ActivityMethod({ name: 'generateOrderInfoRequestMessage' })
  async generateOrderInfoRequestMessage(
    customerName: string,
    customerQuery: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
      Generate a polite, helpful email asking a customer to provide their order information.

      Customer Name: ${customerName || 'there'}
      Customer's Original Question: ${customerQuery}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Context: We couldn't find their order number in their email or match their email to recent orders.

      Write a friendly email that:
      1. Thanks them for reaching out
      2. Explains we'd love to help but need a bit more information
      3. Politely asks them to provide either:
         - Their order number (e.g., #12345)
         - OR the email address they used when placing the order
      4. Reassures them we'll help as soon as they provide this info
      5. Uses a warm, apologetic tone (we want to help!)
      6. Keeps it under 120 tokens
      7. Do not include a salutation (like "Hi" or "Hello") at the beginning
      8. Do not include a signature or sign-off at the end
${voiceContext}

      Important: Be apologetic for the inconvenience but keep it positive and solution-focused.
    `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} requesting order information.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.7;

    const response = await this.agentsService['openaiService'].createChatCompletion(
      messages,
      temperature,
    );

    const messageContent = response.choices[0].message.content || '';

    // Format the message with AI identity
    return this.formatMessageWithAiIdentity(messageContent, customerName, aiIdentity);
  }

  @ActivityMethod({ name: 'checkForCustomerReplyInThread' })
  async checkForCustomerReplyInThread(
    userId: string,
    threadId: string,
    lastCheckedMessageId: string,
  ): Promise<{ hasNewReply: boolean; newEmail?: any }> {
    // Fetch the email thread from database to get the Gmail thread ID
    const emailThread = await this.emailThreadsRepository.findById(threadId);

    if (!emailThread) {
      throw new Error(`Email thread not found: ${threadId}`);
    }

    const gmail = await this.googleOAuthService.getGmailClient(userId);

    // Get the thread from Gmail
    const thread = await gmail.users.threads.get({
      userId: 'me',
      id: emailThread.threadId,
    });

    const messages = thread.data.messages || [];

    // Find messages after the last checked message
    const lastCheckedIndex = messages.findIndex(
      (msg) =>
        msg.id === lastCheckedMessageId ||
        msg.payload?.headers?.find((h) => h.name?.toLowerCase() === 'message-id')?.value ===
          lastCheckedMessageId,
    );

    if (lastCheckedIndex === -1 || lastCheckedIndex === messages.length - 1) {
      // No new messages
      return { hasNewReply: false };
    }

    // Get the latest message (customer's reply)
    const latestMessage = messages[messages.length - 1];
    const headers = latestMessage.payload?.headers || [];

    // Extract email details
    const fromHeader = headers.find((h) => h.name === 'From')?.value || '';
    const subjectHeader = headers.find((h) => h.name === 'Subject')?.value || '';

    // Get message body
    let body = '';
    if (latestMessage.payload?.body?.data) {
      body = Buffer.from(latestMessage.payload.body.data, 'base64').toString('utf-8');
    } else if (latestMessage.payload?.parts) {
      const textPart = latestMessage.payload.parts.find(
        (part: any) => part.mimeType === 'text/plain',
      );
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
      }
    }

    return {
      hasNewReply: true,
      newEmail: {
        messageId: latestMessage.id,
        from: fromHeader,
        subject: subjectHeader,
        body: body,
      },
    };
  }

  @ActivityMethod({ name: 'generateTrackingUpdateNotification' })
  async generateTrackingUpdateNotification(
    orderNumber: string,
    trackingStatus: string,
    trackingUrl: string,
    customerName: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
      Generate a brief, friendly customer notification email for a shipping update.

      Order Number: ${orderNumber}
      Tracking Status: ${trackingStatus}
      Tracking URL: ${trackingUrl}
      Customer Name: ${customerName}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a concise, empathetic notification that:
      1. Informs the customer about the shipping update
      2. Explains what "${trackingStatus}" means in simple terms
      3. Includes the tracking URL for them to check details
      4. Keeps it under 150 tokens
      5. Do not include a salutation (like "Hi" or "Hello") at the beginning
      6. Do not include a signature or sign-off at the end
      7. NEVER mention third-party tracking services like AfterShip, ShipStation, or similar services
      8. Present the tracking information as if it comes directly from the carrier/courier
${voiceContext}

      Important: Focus on this specific status update. Keep it brief and actionable.
    `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} providing shipping updates.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.7;

    const response = await this.agentsService['openaiService'].createChatCompletion(
      messages,
      temperature,
    );

    const messageContent = response.choices[0].message.content || '';

    // Format the message with AI identity
    return this.formatMessageWithAiIdentity(messageContent, customerName, aiIdentity);
  }

  @ActivityMethod({ name: 'generateEscalationResponse' })
  async generateEscalationResponse(
    escalationType: string,
    customerQuery: string,
    customerName: string,
    orderNumber?: string,
    context?: any,
  ): Promise<{ response: string; confidence: number; reason: string }> {
    const contextInfo = context
      ? Object.entries(context)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n')
      : '';

    const prompt = `
      Generate both a customer-facing response AND an internal escalation reason for this customer service escalation.

      Escalation Type: ${escalationType}
      Customer Name: ${customerName || 'there'}
      ${orderNumber ? `Order Number: ${orderNumber}` : ''}
      Customer's Original Query: ${customerQuery}
      ${contextInfo ? `\nAdditional Context:\n${contextInfo}` : ''}

      Generate TWO things:

      1. CUSTOMER RESPONSE: Write a professional, empathetic response that:
         - Acknowledges the issue professionally
         - Shows empathy and understanding
         - Explains what happened (if applicable)
         - Provides next steps or resolution timeline
         - Maintains a helpful, apologetic tone
         - Keeps it under 150 words
         - Do NOT include a signature or sign-off

      2. INTERNAL REASON: Write a concise, technical reason (1-2 sentences, max 100 characters) explaining WHY this is escalated.
         Focus on the technical/business reason, not the customer-facing message.
         Examples:
         - "Low confidence (45%) in email classification as order inquiry"
         - "Order #12345 not found in WooCommerce after customer confirmation"
         - "Tracking number unavailable after 7 days of checking"

      3. CONFIDENCE SCORE: Provide a confidence score (0-100) indicating how confident you are that the customer response appropriately addresses the issue.

      Return your response in JSON format:
      {
        "response": "your customer-facing response here",
        "reason": "concise internal escalation reason",
        "confidence": 85
      }
    `;

    const messages = [
      {
        role: 'system',
        content:
          'You are a professional customer service system that generates both customer responses and internal escalation reasons. Always respond with valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.7;

    const completion = await this.agentsService['openaiService'].createChatCompletion(
      messages,
      temperature,
    );

    const content = completion.choices[0].message.content || '{}';

    try {
      // Strip markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      const parsed = JSON.parse(cleanContent);
      return {
        response: parsed.response || '',
        confidence: parsed.confidence || 50,
        reason: (parsed.reason || 'Escalated for manual review').substring(0, 200).trim(),
      };
    } catch (error) {
      // Fallback if JSON parsing fails
      return {
        response: content,
        confidence: 50,
        reason: 'Escalated for manual review',
      };
    }
  }

  @ActivityMethod({ name: 'createEscalation' })
  async createEscalation(data: any): Promise<any> {
    return this.aiAssistantService.createEscalation(data);
  }

  @ActivityMethod({ name: 'createApprovalQueueItem' })
  async createApprovalQueueItem(data: any): Promise<any> {
    return this.approvalQueueRepository.createApprovalQueueItem(data);
  }

  @ActivityMethod({ name: 'markApprovalQueueItemExecuted' })
  async markApprovalQueueItemExecuted(
    approvalQueueId: string,
    userId: string,
    executionResult: any,
  ): Promise<any> {
    // This method is deprecated but kept for backward compatibility
    // New workflows use markActionAsExecuted instead
    return this.approvalQueueRepository.updateApprovalQueueItem(approvalQueueId, userId, {
      updatedAt: new Date(),
    });
  }

  @ActivityMethod({ name: 'updateApprovalQueueItem' })
  async updateApprovalQueueItem(
    approvalQueueId: string,
    userId: string,
    data: Partial<any>,
  ): Promise<any> {
    return this.approvalQueueRepository.updateApprovalQueueItem(approvalQueueId, userId, data);
  }

  // ===== New Approval Queue Activity Methods =====

  @ActivityMethod({ name: 'findApprovalQueueByWorkflowId' })
  async findApprovalQueueByWorkflowId(workflowId: string, userId: string): Promise<any> {
    return this.approvalQueueRepository.findByWorkflowId(workflowId, userId);
  }

  @ActivityMethod({ name: 'createApprovalQueueAction' })
  async createApprovalQueueAction(data: any): Promise<any> {
    return this.approvalQueueActionsRepository.createAction(data);
  }

  @ActivityMethod({ name: 'updateApprovalQueueAction' })
  async updateApprovalQueueAction(actionId: string, data: any): Promise<any> {
    return this.approvalQueueActionsRepository.updateAction(actionId, data);
  }

  @ActivityMethod({ name: 'updateApprovalQueueStatus' })
  async updateApprovalQueueStatus(
    approvalQueueId: string,
    userId: string,
    status: string,
    escalationId?: string,
  ): Promise<any> {
    if (status === 'in_progress') {
      return this.approvalQueueRepository.markAsInProgress(approvalQueueId, userId);
    } else if (status === 'completed') {
      return this.approvalQueueRepository.markAsCompleted(approvalQueueId, userId);
    } else if (status === 'escalated' && escalationId) {
      return this.approvalQueueRepository.markAsEscalated(approvalQueueId, userId, escalationId);
    }
    return this.approvalQueueRepository.updateStatus(approvalQueueId, userId, status);
  }

  @ActivityMethod({ name: 'markActionAsExecuted' })
  async markActionAsExecuted(actionId: string, executionResult: any): Promise<any> {
    return this.approvalQueueActionsRepository.markAsExecuted(actionId, executionResult);
  }

  @ActivityMethod({ name: 'markActionAsEscalated' })
  async markActionAsEscalated(
    actionId: string,
    escalationId: string,
    executionError: any,
  ): Promise<any> {
    return this.approvalQueueActionsRepository.markAsEscalated(
      actionId,
      escalationId,
      executionError,
    );
  }

  @ActivityMethod({ name: 'markEmailAsRead' })
  async markEmailAsRead(userId: string, messageId: string): Promise<{ success: boolean }> {
    return this.googleOAuthService.markEmailAsRead(userId, messageId);
  }

  /**
   * Helper method to build voice & settings instructions for AI prompts
   */
  private buildVoiceAndSettingsContext(aiIdentity?: any): string {
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
   * Helper method to format email messages with AI identity (salutation and signature)
   */
  private formatMessageWithAiIdentity(
    messageContent: string,
    customerName: string,
    aiIdentity?: any,
  ): string {
    const salutation = aiIdentity?.emailSalutation || 'Hi';
    const agentName = aiIdentity?.aiAgentName || '';
    const agentTitle = aiIdentity?.aiAgentTitle || '';
    const companyName = aiIdentity?.companyNameForEmailSignature || '';
    const signatureFooter = aiIdentity?.signatureFooter || '';

    // Build salutation
    const greeting = `${salutation} ${customerName},\n\n`;

    // Build signature
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

    return `${greeting}${messageContent}${signature}`;
  }
}
