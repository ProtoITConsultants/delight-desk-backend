import { Injectable } from '@nestjs/common';
import { OpenAIService } from '../../openai/openai.service';
import { OrderDetails } from '../types';

@Injectable()
export class AiResponseUtil {
  constructor(private readonly openaiService: OpenAIService) {}

  async generateAiResponseForWismo(
    email: any,
    orderDetails: OrderDetails,
    trackingDetails: any | null,
  ): Promise<string> {
    const prompt = `
      Generate an empathetic customer service response for this order status inquiry based on the available information.

      Customer Email: ${email}\n\n

      Order Information: ${orderDetails}\n\n
      
      Tracking Details: ${trackingDetails}\n\n

      Write a helpful, empathetic response that:
      1. Thanks the customer
      2. Provides clear order status
      3. Includes tracking details if available
      4. Sets expectations for delivery
      5. Offers help if needed
      6. Keep it under 300 tokens

      Sign off as "Customer Support Team"
      `;

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful customer service agent providing order status updates.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.7;

    const response = await this.openaiService.createChatCompletion(messages, temperature);

    return response.choices[0].message.content || '';
  }
}
