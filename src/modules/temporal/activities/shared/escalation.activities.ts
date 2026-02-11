import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AiAssistantService } from '../../../ai-assistant/ai-assistant.service';
import { AgentsService } from '../../../agents/agents.service';

@Injectable()
@Activity()
export class EscalationActivities {
  constructor(
    private readonly aiAssistantService: AiAssistantService,
    private readonly agentsService: AgentsService,
  ) {}

  @ActivityMethod({ name: 'createEscalation' })
  async createEscalation(data: any): Promise<any> {
    return this.aiAssistantService.createEscalation(data);
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
}
