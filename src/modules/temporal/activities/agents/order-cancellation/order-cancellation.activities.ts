import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { AgentsService } from 'src/modules/agents/agents.service';
import { WooCommerceRestApiService } from 'src/modules/woocommerce/woocommerce-rest-api.service';
import { MessageFormattingHelper } from '../../shared/message-formatting.helper';

@Injectable()
@Activity()
export class OrderCancellationActivities {
  constructor(
    private readonly systemSettingsRepository: SystemSettingsRepository,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
    private readonly agentsService: AgentsService,
    private readonly messageFormattingHelper: MessageFormattingHelper,
  ) {}

  @ActivityMethod({ name: 'getFulfillmentMethod' })
  async getFulfillmentMethod(
    userId: string,
  ): Promise<'self' | 'custom_warehouse' | 'shipstation' | 'shipbob'> {
    const settings = await this.systemSettingsRepository.findByUser(userId);
    const method = settings?.fulfillmentMethod;

    if (
      method === 'self' ||
      method === 'custom_warehouse' ||
      method === 'shipstation' ||
      method === 'shipbob'
    ) {
      return method;
    }

    return 'self';
  }

  @ActivityMethod({ name: 'getWarehouseEmail' })
  async getWarehouseEmail(userId: string): Promise<string | null> {
    const settings = await this.systemSettingsRepository.findByUser(userId);
    return settings?.warehouseEmail ?? null;
  }

  @ActivityMethod({ name: 'updateWooCommerceOrderStatus' })
  updateWooCommerceOrderStatus(userId: string, orderId: string, status: string): Promise<any> {
    return this.wooCommerceRestApiService.updateOrderStatus(userId, orderId, status);
  }

  @ActivityMethod({ name: 'processWooCommerceRefund' })
  processWooCommerceRefund(
    userId: string,
    orderId: string,
    payload?: {
      amount?: string;
      reason?: string;
      apiRefund?: boolean;
      restockRefundedItems?: boolean;
      lineItems?: Array<{
        id: number | string;
        quantity?: number;
        refund_total?: string;
      }>;
    },
  ): Promise<any> {
    return this.wooCommerceRestApiService.createOrderRefund(userId, orderId, payload);
  }

  @ActivityMethod({ name: 'generateCancellationProcessedMessage' })
  async generateCancellationProcessedMessage(
    orderNumber: string,
    customerName: string,
    partialFulfillmentDetected: boolean,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
      Generate a customer update email for a cancellation request that has just been processed.

      Order Number: ${orderNumber}
      Partial Fulfillment Detected: ${partialFulfillmentDetected ? 'yes' : 'no'}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a response that:
      1. Confirms the cancellation step has been completed
      2. If partial fulfillment is detected, clearly mention only remaining eligible items were cancelled
      3. States that refund processing is the next step and a separate refund update will follow
      4. Keeps tone empathetic and professional
      5. Keeps it under 120 tokens
      6. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
      7. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
      8. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} sending a cancellation progress update.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.6);
    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }

  @ActivityMethod({ name: 'generateCustomWarehouseAcknowledgementMessage' })
  async generateCustomWarehouseAcknowledgementMessage(
    orderNumber: string,
    customerName: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
      Generate a customer acknowledgement email for an order cancellation request that requires warehouse confirmation.

      Order Number: ${orderNumber}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a response that:
      1. Confirms we received the cancellation request for order #${orderNumber}
      2. Clearly states we are now coordinating with the warehouse team
      3. Sets expectation that we will share an update as soon as warehouse confirms
      4. Uses a calm and reassuring tone
      5. Keeps it under 100 tokens
      6. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
      7. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
      8. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} sending a warehouse-coordination acknowledgement for a cancellation request.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.6);
    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }

  @ActivityMethod({ name: 'generateCustomWarehouseCannotCancelMessage' })
  async generateCustomWarehouseCannotCancelMessage(
    orderNumber: string,
    orderStatus: string,
    customerName: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
      Generate a customer response for a cancellation request that can no longer be processed because of the current order status.

      Order Number: ${orderNumber}
      Current Order Status: ${orderStatus}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a response that:
      1. Acknowledges the customer cancellation request for order #${orderNumber}
      2. Clearly explains cancellation is no longer possible because the order is already in "${orderStatus}" status
      3. Advises the customer to reply for return instructions once the package arrives
      4. Uses a professional and empathetic tone
      5. Keeps it under 120 tokens
      6. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
      7. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
      8. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} responding when cancellation is no longer possible.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.6);
    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }

  @ActivityMethod({ name: 'generateCustomWarehouseTooLateMessage' })
  async generateCustomWarehouseTooLateMessage(
    orderNumber: string,
    customerName: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
      Generate a final customer response after warehouse review confirmed the order can no longer be cancelled.

      Order Number: ${orderNumber}
      Warehouse Outcome: cannot_cancel
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a response that:
      1. Confirms we checked with the warehouse team
      2. Clearly states the order can no longer be cancelled because it already entered shipping flow
      3. Advises the customer to reply for return instructions if delivery still happens
      4. Uses a supportive and clear tone
      5. Keeps it under 120 tokens
      6. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
      7. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
      8. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} sharing final cancellation limitation guidance after warehouse confirmation.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.6);
    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }

  @ActivityMethod({ name: 'generateCustomWarehouseRequestEmail' })
  async generateCustomWarehouseRequestEmail(
    orderNumber: string,
    workflowId: string,
    customerBillingEmail?: string | null,
    aiIdentity?: any,
  ): Promise<{ subject: string; body: string }> {
    const subject = `URGENT: Cancel Order #${orderNumber} - Customer Request`;
    const signature = this.messageFormattingHelper.buildSignatureFromAiIdentity(aiIdentity);
    const body = `Please confirm whether order #${orderNumber} can still be canceled before shipment.

Customer requested cancellation and is awaiting our update. Please confirm as soon as possible.

Order details:
- WooCommerce Order ID: #${orderNumber}
- Customer Billing Email: ${customerBillingEmail || 'Not available'}

Please reply with exactly one value:
- canceled
- cannot_cancel

----------------------------------------
${signature}

Internal use only:
Internal Reference Id: [DD-OC-WF:${workflowId}]`;

    return { subject, body };
  }

  @ActivityMethod({ name: 'detectWarehouseReplyIntent' })
  async detectWarehouseReplyIntent(
    warehouseReplyBody: string | null | undefined,
  ): Promise<'canceled' | 'cannot_cancel' | 'unknown'> {
    const normalizedBody = (warehouseReplyBody || '').trim();
    if (!normalizedBody) {
      return 'unknown';
    }

    const messages = [
      {
        role: 'system',
        content:
          'You classify warehouse cancellation replies. Return exactly one token: canceled, cannot_cancel, or unknown. ' +
          'Use canceled when warehouse confirms cancellation was completed/possible. ' +
          'Use cannot_cancel when warehouse indicates cancellation is no longer possible. ' +
          'Use unknown if unclear, conditional, or asking for more information.',
      },
      {
        role: 'user',
        content: `Warehouse reply:\n${normalizedBody}`,
      },
    ];

    try {
      const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0);
      const rawIntent = (response.choices[0].message.content || '').trim().toLowerCase();

      if (rawIntent.includes('cannot_cancel')) return 'cannot_cancel';
      if (rawIntent.includes('canceled')) return 'canceled';

      // Fallback normalization for slight model variations.
      if (rawIntent.includes('cannot cancel')) return 'cannot_cancel';
      if (rawIntent.includes('cancelled') || rawIntent.includes('canceled')) return 'canceled';
    } catch {
      // Fall through to deterministic keyword fallback below.
    }

    const fallback = normalizedBody.toLowerCase();
    if (fallback.includes('cannot cancel')) return 'cannot_cancel';
    if (
      fallback.includes('cancelled') ||
      fallback.includes('canceled') ||
      fallback.includes('cancellation done')
    ) {
      return 'canceled';
    }

    return 'unknown';
  }

  @ActivityMethod({ name: 'generateRefundProcessedMessage' })
  async generateRefundProcessedMessage(
    orderNumber: string,
    customerName: string,
    refundedAmount: string | undefined,
    refundTimelineBusinessDays: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
      Generate a final refund confirmation email after order cancellation has been completed.

      Order Number: ${orderNumber}
      Refunded Amount: ${refundedAmount ?? 'not specified'}
      Refund Timeline: ${refundTimelineBusinessDays}
      ${aiIdentity?.aiAgentName ? `AI Agent Name: ${aiIdentity.aiAgentName}` : ''}
      ${aiIdentity?.aiAgentTitle ? `AI Agent Title: ${aiIdentity.aiAgentTitle}` : ''}

      Write a response that:
      1. Confirms the refund has been processed for order #${orderNumber}
      2. Mentions refunded amount if provided
      3. Sets expectation that funds typically appear within ${refundTimelineBusinessDays}
      4. Uses a clear and reassuring tone
      5. Keeps it under 120 tokens
      6. Do not include a salutation (like "Hi" or "Hello") at the beginning — a personalised greeting is added automatically
      7. Do not address or refer to the customer by name anywhere in the body — the greeting already handles personalisation
      8. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content: `You are ${aiIdentity?.aiAgentName || 'a helpful customer service agent'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} sending a refund completion confirmation.`,
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.6);
    const rawContent = response.choices[0].message.content || '';
    const messageContent = this.messageFormattingHelper.stripMarkdownLinks(rawContent);

    return this.messageFormattingHelper.formatMessageWithAiIdentity(
      messageContent,
      customerName,
      aiIdentity,
    );
  }
}
