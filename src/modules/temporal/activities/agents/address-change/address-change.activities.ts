import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { AgentsService } from 'src/modules/agents/agents.service';
import { ShipBobService } from 'src/modules/shipbob/shipbob.service';
import { ShipStationService } from 'src/modules/shipstation/shipstation.service';
import { WooCommerceRestApiService } from 'src/modules/woocommerce/woocommerce-rest-api.service';
import { MessageFormattingHelper } from '../../shared/message-formatting.helper';

interface ParsedAddressChange {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  confidence: number;
}

@Injectable()
@Activity()
export class AddressChangeActivities {
  constructor(
    private readonly systemSettingsRepository: SystemSettingsRepository,
    private readonly agentsService: AgentsService,
    private readonly shipBobService: ShipBobService,
    private readonly shipStationService: ShipStationService,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
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

  @ActivityMethod({ name: 'generateCustomWarehouseAddressChangeAcknowledgementMessage' })
  async generateCustomWarehouseAddressChangeAcknowledgementMessage(
    orderNumber: string,
    customerName: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
Generate a customer acknowledgement email for an address-change request that requires warehouse confirmation.

Order Number: ${orderNumber}

Write a response that:
1. Confirms we received the address-change request for order #${orderNumber}
2. Clearly states we are coordinating with the warehouse team before applying the update
3. Sets expectation that we will share a final update as soon as warehouse confirms
4. Keeps it under 100 tokens
5. Do not include a salutation (like "Hi" or "Hello") at the beginning - a personalised greeting is added automatically
6. Do not address or refer to the customer by name anywhere in the body - the greeting already handles personalisation
7. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content:
          `You are ${aiIdentity?.aiAgentName || 'a customer service rep'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} writing an address-change acknowledgement. ` +
          'Your replies are short, plain-spoken, and conversational — like a quick note from a real person, not a corporate template. ' +
          'Get to the point in the first sentence. Use contractions. Skip apology theatrics, gratitude rituals, and FAQ-style boilerplate. ' +
          'Brand voice and merchant overrides may layer on top of this baseline, but the baseline is always: brief, natural, helpful.',
      },
      { role: 'user', content: prompt },
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

  @ActivityMethod({ name: 'generateCustomWarehouseAddressChangeRequestEmail' })
  async generateCustomWarehouseAddressChangeRequestEmail(
    orderNumber: string,
    formattedAddress: string,
    workflowId: string,
    customerBillingEmail?: string | null,
    aiIdentity?: any,
  ): Promise<{ subject: string; body: string }> {
    const subject = `URGENT: Address Change Request - Order #${orderNumber}`;
    const signature = this.messageFormattingHelper.buildSignatureFromAiIdentity(aiIdentity);
    const body = `Please confirm whether shipping address can be updated for order #${orderNumber} before shipment.

Requested new shipping address:
${formattedAddress}

Order details:
- WooCommerce Order ID: #${orderNumber}
- Customer Billing Email: ${customerBillingEmail || 'Not available'}

Please reply with exactly one value:
- updated
- cannot_update

----------------------------------------
${signature}

Internal use only:
Internal Reference Id: [DD-AC-WF:${workflowId}]`;

    return { subject, body };
  }

  @ActivityMethod({ name: 'detectWarehouseAddressChangeReplyIntent' })
  async detectWarehouseAddressChangeReplyIntent(
    warehouseReplyBody: string | null | undefined,
  ): Promise<'updated' | 'cannot_update' | 'unknown'> {
    const normalizedBody = (warehouseReplyBody || '').trim();
    if (!normalizedBody) {
      return 'unknown';
    }

    const messages = [
      {
        role: 'system',
        content:
          'You classify warehouse address-change replies. Return exactly one token: updated, cannot_update, or unknown. ' +
          'Use updated when warehouse confirms address update was completed/possible. ' +
          'Use cannot_update when warehouse indicates update is no longer possible. ' +
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

      if (rawIntent.includes('cannot_update')) return 'cannot_update';
      if (rawIntent.includes('updated')) return 'updated';

      if (rawIntent.includes('cannot update')) return 'cannot_update';
      if (rawIntent.includes('updated') || rawIntent.includes('address changed')) return 'updated';
    } catch {
      // Fall through to deterministic keyword fallback below.
    }

    const fallback = normalizedBody.toLowerCase();
    if (fallback.includes('cannot update') || fallback.includes('unable to update')) {
      return 'cannot_update';
    }
    if (
      fallback.includes('updated') ||
      fallback.includes('address changed') ||
      fallback.includes('update completed')
    ) {
      return 'updated';
    }

    return 'unknown';
  }

  @ActivityMethod({ name: 'extractAddressChangeRequest' })
  async extractAddressChangeRequest(emailBody: string): Promise<ParsedAddressChange> {
    const prompt = `
Extract the customer's NEW shipping address from this email.
Return only valid JSON with this schema:
{
  "firstName": string | null,
  "lastName": string | null,
  "company": string | null,
  "address1": string | null,
  "address2": string | null,
  "city": string | null,
  "state": string | null,
  "postalCode": string | null,
  "country": string | null,
  "phone": string | null,
  "confidence": number
}

Rules:
- confidence is a number from 0 to 100.
- If a field is missing, use null.
- Do not infer values that are not stated.
- Return JSON only.

Email:
${emailBody}
    `;

    const messages = [
      {
        role: 'system',
        content:
          'You extract address change details from customer support emails and return strict JSON only.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0);
    const raw = response.choices[0].message.content || '{}';
    const normalized = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    try {
      const parsed = JSON.parse(normalized);
      return {
        firstName: parsed.firstName ?? undefined,
        lastName: parsed.lastName ?? undefined,
        company: parsed.company ?? undefined,
        address1: parsed.address1 ?? undefined,
        address2: parsed.address2 ?? undefined,
        city: parsed.city ?? undefined,
        state: parsed.state ?? undefined,
        postalCode: parsed.postalCode ?? undefined,
        country: parsed.country ?? undefined,
        phone: parsed.phone ?? undefined,
        confidence: Number(parsed.confidence ?? 0),
      };
    } catch {
      return { confidence: 0 };
    }
  }

  @ActivityMethod({ name: 'updateWooCommerceOrderShippingAddress' })
  async updateWooCommerceOrderShippingAddress(
    userId: string,
    orderId: string,
    shipping: {
      first_name?: string;
      last_name?: string;
      company?: string;
      address_1: string;
      address_2?: string;
      city: string;
      state?: string;
      postcode: string;
      country: string;
      phone?: string;
    },
  ): Promise<any> {
    return this.wooCommerceRestApiService.updateOrderShippingAddress(userId, orderId, shipping);
  }

  @ActivityMethod({ name: 'getShipBobOrderByWooCommerceOrderId' })
  async getShipBobOrderByWooCommerceOrderId(
    userId: string,
    wooCommerceOrderId: string,
  ): Promise<any | null> {
    return this.shipBobService.getOrderByWooCommerceOrderId(userId, wooCommerceOrderId);
  }

  @ActivityMethod({ name: 'getShipStationOrderByWooCommerceOrderId' })
  async getShipStationOrderByWooCommerceOrderId(
    userId: string,
    wooCommerceOrderId: string,
  ): Promise<any | null> {
    return this.shipStationService.getOrderByWooCommerceOrderId(userId, wooCommerceOrderId);
  }

  @ActivityMethod({ name: 'updateShipBobOrderShippingAddressByWooCommerceOrderId' })
  async updateShipBobOrderShippingAddressByWooCommerceOrderId(
    userId: string,
    wooCommerceOrderId: string,
    recipient: {
      name: string;
      address: {
        address1: string;
        address2?: string;
        city: string;
        state?: string;
        country: string;
        zip_code: string;
        company_name?: string;
      };
      email?: string;
      phone_number?: string;
    },
  ): Promise<any> {
    return this.shipBobService.updateOrderRecipientAddressByWooCommerceOrderId(
      userId,
      wooCommerceOrderId,
      recipient,
    );
  }

  @ActivityMethod({ name: 'updateShipStationOrderShippingAddressByWooCommerceOrderId' })
  async updateShipStationOrderShippingAddressByWooCommerceOrderId(
    userId: string,
    wooCommerceOrderId: string,
    shippingAddress: {
      name?: string;
      company?: string;
      street1: string;
      street2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
      phone?: string;
      residential?: boolean;
    },
  ): Promise<any> {
    return this.shipStationService.updateOrderShippingAddressByWooCommerceOrderId(
      userId,
      wooCommerceOrderId,
      shippingAddress,
    );
  }

  @ActivityMethod({ name: 'generateAddressChangeProcessedMessage' })
  async generateAddressChangeProcessedMessage(
    orderNumber: string,
    customerName: string,
    formattedAddress: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);
    const prompt = `
Generate a customer confirmation email for a completed shipping address update.

Order Number: ${orderNumber}
New Shipping Address: ${formattedAddress}

Write a response that:
1. Confirms the shipping address update for order #${orderNumber}
2. Clearly states the new address we updated to
3. Encourages the customer to reply immediately if any detail is wrong
4. Keeps it under 120 tokens
5. Do not include a salutation (like "Hi" or "Hello") at the beginning - a personalised greeting is added automatically
6. Do not address or refer to the customer by name anywhere in the body - the greeting already handles personalisation
7. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content:
          `You are ${aiIdentity?.aiAgentName || 'a customer service rep'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} writing an address-change confirmation. ` +
          'Your replies are short, plain-spoken, and conversational — like a quick note from a real person, not a corporate template. ' +
          'Get to the point in the first sentence. Use contractions. Skip apology theatrics, gratitude rituals, and FAQ-style boilerplate. ' +
          'Brand voice and merchant overrides may layer on top of this baseline, but the baseline is always: brief, natural, helpful.',
      },
      { role: 'user', content: prompt },
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

  @ActivityMethod({ name: 'generateAddressChangeCannotProcessMessage' })
  async generateAddressChangeCannotProcessMessage(
    orderNumber: string,
    reason: string,
    customerName: string,
    aiIdentity?: any,
  ): Promise<string> {
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);
    const prompt = `
Generate a response for an address-change request that cannot be completed automatically.

Order Number: ${orderNumber}
Reason: ${reason}

Write a response that:
1. Acknowledges the address change request
2. Clearly explains why it cannot be completed automatically
3. States that support will continue this manually
4. Keeps it under 110 tokens
5. Do not include a salutation (like "Hi" or "Hello") at the beginning - a personalised greeting is added automatically
6. Do not address or refer to the customer by name anywhere in the body - the greeting already handles personalisation
7. Do not include a signature or sign-off at the end
${voiceContext}
    `;

    const messages = [
      {
        role: 'system',
        content:
          `You are ${aiIdentity?.aiAgentName || 'a customer service rep'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} writing an address-change limitation response. ` +
          'Your replies are short, plain-spoken, and conversational — like a quick note from a real person, not a corporate template. ' +
          'Get to the point in the first sentence. Use contractions. Skip apology theatrics, gratitude rituals, and FAQ-style boilerplate. ' +
          'Brand voice and merchant overrides may layer on top of this baseline, but the baseline is always: brief, natural, helpful.',
      },
      { role: 'user', content: prompt },
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
}
