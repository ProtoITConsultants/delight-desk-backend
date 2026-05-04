import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { MessageFormattingHelper } from './message-formatting.helper';
import { AgentsService } from 'src/modules/agents/agents.service';

@Injectable()
@Activity()
export class CustomerMessageActivities {
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
Generate a brief acknowledgement email for a customer who inquired about their order status.

Order Number: ${orderNumber}
Customer's Question: ${customerQuery}

Write an acknowledgement that:
1. Confirms we received their inquiry about order #${orderNumber}
2. Lets them know we're looking into it and will provide an update soon
3. Keeps it under 80 tokens
4. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
5. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
6. Do not include a signature or sign-off at the end
${voiceContext}

Important: This is just an acknowledgement, not the final response. Keep it brief and direct.
    `;

    const messages = [
      {
        role: 'system',
        content:
          `You are ${aiIdentity?.aiAgentName || 'a customer service rep'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} writing a quick order inquiry acknowledgement. ` +
          'Your replies are short, plain-spoken, and conversational — like a quick note from a real person, not a corporate template. ' +
          'Get to the point in the first sentence. Use contractions. Skip apology theatrics, gratitude rituals, and FAQ-style boilerplate. ' +
          'Brand voice and merchant overrides may layer on top of this baseline, but the baseline is always: brief, natural, helpful.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.4);

    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

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
Generate an email asking a customer to provide their order information so we can help them.

Customer's Original Question: ${customerQuery}

Context: We couldn't find their order number in their email or match their email to recent orders.

Write an email that:
1. Explains we'd love to help but need a bit more information
2. Asks them to provide either:
   - Their order number (e.g., #12345)
   - OR the email address they used when placing the order
3. Reassures them we'll help as soon as they provide this info
4. Keeps it under 100 tokens
5. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
6. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
7. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content:
          `You are ${aiIdentity?.aiAgentName || 'a customer service rep'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} writing a request for order details. ` +
          'Your replies are short, plain-spoken, and conversational — like a quick note from a real person, not a corporate template. ' +
          'Get to the point in the first sentence. Use contractions. Skip apology theatrics, gratitude rituals, and FAQ-style boilerplate. ' +
          'Brand voice and merchant overrides may layer on top of this baseline, but the baseline is always: brief, natural, helpful.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.4);

    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

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

    // Strip billing/customer identity fields before passing to the AI so the model
    // cannot accidentally address the customer by the WooCommerce billing name
    // instead of the name we derive from their sender email address.
    const { customerInfo: _stripped, ...sanitizedOrderDetails } = orderDetails ?? {};

    const prompt = `
      Generate an empathetic customer service response for this order status inquiry based on the available information.

      Customer Name: ${customerName}
      Order Information: ${JSON.stringify(sanitizedOrderDetails, null, 2)}
      Tracking Details: ${trackingDetails ? JSON.stringify(trackingDetails, null, 2) : 'No tracking information available yet'}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a helpful, empathetic response that:
      1. Provides clear order status — get straight to the point
      2. Includes tracking details if available (tracking number, carrier, current status, estimated delivery)
      3. If no tracking available, explain that the order is being prepared and tracking will be available soon
      4. Sets expectations for delivery
      5. Offers further help with a brief, natural closing line
      6. Keep it under 250 tokens
      7. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
      8. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
      9. Do not include a signature or sign-off at the end
      10. IMPORTANT: Do NOT use markdown formatting of any kind. Do NOT use [text](url) style links. If you include a tracking URL, write it as plain text directly in the sentence (e.g. "You can track your shipment at https://..."). Never wrap URLs in brackets or parentheses.
      11. Do NOT use any name or email address found inside the Order Information or Tracking Details objects.
  ${voiceContext}
      Important: Only include information that is actually available in the data provided above. Do not make up tracking numbers, delivery dates, or other details.
      `;

    const messages = [
      {
        role: 'system',
        content:
          `You are ${aiIdentity?.aiAgentName || 'a customer service rep'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} writing an order status update. ` +
          'Your replies are clear, plain-spoken, and conversational — like a quick note from a real person, not a corporate template. ' +
          'Lead with the most important status detail. Use contractions. Skip apology theatrics, gratitude rituals, and FAQ-style boilerplate. ' +
          'Brand voice and merchant overrides may layer on top of this baseline, but the baseline is always: clear, natural, helpful.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.5);

    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

    // Format the message with AI identity
    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }

  @ActivityMethod({ name: 'generateProblematicOrderStatusMessage' })
  async generateProblematicOrderStatusMessage(
    orderNumber: string,
    orderStatus: string,
    customerName: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
Generate a customer response for an order cancellation request that cannot proceed automatically.

Order Number: ${orderNumber}
Current Order Status: ${orderStatus}

Context:
- The customer asked to cancel their order.
- The order status is currently "${orderStatus}".
- This status requires manual support handling instead of automated cancellation.

Write a response that:
1. Acknowledges the cancellation request
2. Clearly explains we cannot complete automatic cancellation due to the current order status
3. Sets expectation that support will review manually
4. Keeps it under 120 tokens
5. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
6. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
7. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content:
          `You are ${aiIdentity?.aiAgentName || 'a customer service rep'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} writing a manual-review-required cancellation response. ` +
          'Your replies are short, plain-spoken, and conversational — like a quick note from a real person, not a corporate template. ' +
          'Get to the point in the first sentence. Use contractions. Skip apology theatrics, gratitude rituals, and FAQ-style boilerplate. ' +
          'Brand voice and merchant overrides may layer on top of this baseline, but the baseline is always: brief, natural, helpful.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.4;

    const response = await this.agentsService['openaiService'].createChatCompletion(
      messages,
      temperature,
    );

    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }
}
