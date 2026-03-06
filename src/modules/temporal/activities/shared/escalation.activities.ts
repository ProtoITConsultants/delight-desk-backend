import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AiAssistantService } from 'src/modules/ai-assistant/ai-assistant.service';
import { AgentsService } from 'src/modules/agents/agents.service';

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
    const contextInfo = context ? JSON.stringify(context, null, 2) : '';

    const prompt = `
      Generate a customer-facing response for a customer service escalation.

      Escalation Type: ${escalationType}
      Customer Name: ${customerName || 'there'}
      ${orderNumber ? `Order Number: ${orderNumber}` : ''}
      Customer's Original Query: ${customerQuery}
      ${contextInfo ? `\nAdditional Context:\n${contextInfo}` : ''}

      Write a professional, empathetic response that:
         - Acknowledges the issue professionally
         - Shows empathy and understanding
         - Does NOT invent root causes, system issues, timelines, or guarantees
         - Uses only facts present in the provided query/context
         - If details are missing, explicitly say the team is reviewing and will follow up
         - Provides next steps or resolution timeline
         - Maintains a helpful, apologetic tone
         - Keeps it under 150 words
         - Do NOT include a signature or sign-off

      Also provide a confidence score (0-100) indicating how confident you are that the response is safe and appropriate.
      INTERNAL REASON RULE: return an empty string for "reason" because internal escalation reason is deterministic from workflow errors.

      Return your response in JSON format:
      {
        "response": "your customer-facing response here",
        "reason": "",
        "confidence": 85
      }
    `;

    const messages = [
      {
        role: 'system',
        content:
          'You are a professional customer service system. Never invent operational causes. Use only provided facts. Always respond with valid JSON.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.2;

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
        reason: '',
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
