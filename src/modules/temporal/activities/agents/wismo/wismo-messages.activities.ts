import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AgentsService } from '../../../../agents/agents.service';
import { MessageFormattingHelper } from '../../shared/message-formatting.helper';

@Injectable()
@Activity()
export class WismoMessageActivities {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly messageFormattingHelper: MessageFormattingHelper,
  ) {}

  @ActivityMethod({ name: 'generateAcknowledgementMessage' })
  async generateAcknowledgementMessage(
    orderNumber: string,
    customerName: string,
    customerQuery: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

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
    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }

  @ActivityMethod({ name: 'generateOrderInfoRequestMessage' })
  async generateOrderInfoRequestMessage(
    customerName: string,
    customerQuery: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

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
    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }

  @ActivityMethod({ name: 'generateTrackingUpdateNotification' })
  async generateTrackingUpdateNotification(
    orderNumber: string,
    trackingStatus: string,
    trackingUrl: string,
    customerName: string,
    aiIdentity?: any,
    orderDetails?: any,
    trackingDetails?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    /*
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
     */

    const prompt = `
      Generate an empathetic customer service response for this order status inquiry based on the available information.

      Order Information: ${JSON.stringify(orderDetails, null, 2)}
      Tracking Details: ${trackingDetails ? JSON.stringify(trackingDetails, null, 2) : 'No tracking information available yet'}
      Customer Name: ${customerName}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a helpful, empathetic response that:
      1. Thanks the customer
      2. Provides clear order status
      3. Includes tracking details if available (tracking number, carrier, current status, estimated delivery)
      4. If no tracking available, explain that the order is being prepared and tracking will be available soon
      5. Sets expectations for delivery
      6. Offers help if needed
      7. Keep it under 300 tokens
      8. Do not include a salutation (like "Hi" or "Hello") at the beginning
      9. Do not include a signature or sign-off at the end

      Important: Only include information that is actually available in the data provided above. Do not make up tracking numbers, delivery dates, or other details.
      `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} providing order status updates.`,
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
    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }
}
