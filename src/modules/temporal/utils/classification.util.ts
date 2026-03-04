import { Injectable } from '@nestjs/common';
import { OpenAIService } from '../../openai/openai.service';
import { ClassificationResult } from '../workflows/types';

@Injectable()
export class ClassificationUtil {
  constructor(private readonly openaiService: OpenAIService) {}

  async classify(email: any): Promise<ClassificationResult> {
    const prompt = this.buildClassificationPrompt(email);
    const messages = [
      {
        role: 'system',
        content:
          'You are an email classification expert. Classify customer service emails accurately.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.3;
    const response_format = { type: 'json_object' };

    const response = await this.openaiService.createChatCompletion(
      messages,
      temperature,
      response_format,
    );

    const classification = JSON.parse(
      response.choices[0].message.content || '{}',
    ) as ClassificationResult;

    return classification;
  }

  private buildClassificationPrompt(email: any): string {
    return `
          Classify the following customer email into one of these categories:
          CUSTOMER INTENT CATEGORIES:
          1. **wismo** (WISMO - Where Is My Order)
          - Intent: Customer wants to know where their order is, when it will arrive, or why it hasn't arrived
          - Context: Any concern about order location, delivery timing, shipping progress
          - Examples: "Where is my order?", "Expected yesterday but not here", "Haven't received my package", "Order #123 status?"
          
          2. **subscription**
          - Intent: Customer wants to modify their ongoing subscription
          - Context: Pause, resume, cancel, change contents, modify schedule
          
          3. **product**
          - Intent: Customer has questions about product features or specifications
          - Context: Product information, compatibility, usage
          
          4. **returns**
          - Intent: Customer wants to exchange or return a received product
          - Context: Product exchanges, returns (not necessarily for refund)
  
          5. **promo_code**
          - Intent: Customer is asking about available discounts, promo codes, promo code refunds or special offers
          - Context: General discount requests, first-time customer inquiries, asking "Do you have any sales?", "Any coupons available?", "Can I get a discount?"
          - Examples: "Do you have any promo codes?", "Any discounts for new customers?", "Are there any sales happening?", "Can I get a coupon?"
          
          6. **address_change**
          - Intent: Customer wants to change shipping address
          - Context: Update delivery location
                        
          7. **order_cancellation**
          - Intent: Customer wants to stop an order before it ships
          - Context: Prevent shipment, cancel before processing and refund payment          
            
          8. **escalation**
              - Intent: Customer is frustrated, threatening, or has complex multi-issue problems
              - Context: Complaints, legal threats, multiple failed attempts
              - Keywords/Phrases: "Human", "speak to someone", "real person", "human agent", "escalate", "transfer me", "I need a person", "connect me to someone", "I want to talk to a human", "get a human on the line"
              - Priority: ALWAYS urgent regardless of other factors
          
          9. **thankful**
          - Intent: Customer is expressing gratitude, appreciation, or positive feedback
          - Context: Thank-you messages, compliments, positive reviews, satisfied responses
          - Examples: "Thank you so much!", "Great service!", "Really appreciate the help", "You guys are amazing"
  
          PRIORITY ASSESSMENT:
          - **urgent**: Human escalation requests, events tomorrow, damaged goods, safety issues
          - **high**: Delayed orders, upset customers, payment problems, billing disputes  
          - **medium**: Standard requests, general order questions, subscription changes
          - **low**: Simple questions, compliments, product info requests
  
          ANALYSIS INSTRUCTIONS:
          1. **FIRST CHECK FOR HUMAN ESCALATION**: Look for any requests to speak to a human, real person, agent, or escalation - if found, classify as "escalation" with "urgent" priority
          2. Read the email content to understand the customer's underlying concern and emotional state
          3. Identify the primary intent - what does the customer actually want?
          4. Consider context clues like order numbers, timing expressions, emotional language
          5. Assign appropriate priority based on urgency and customer sentiment
          6. Be confident in your assessment - modern AI should easily understand customer intent

          Email Details:
          Subject: ${email.subject || 'N/A'}
          From: ${email.fromEmail}
          Body: ${email.body}

          Return a JSON object with:
          {
            "category": "<category>",
            "confidence": <0-100>,
            "reasoning": "<brief explanation>",
            "priority": "<low|medium|high|urgent>",
            "sentiment": "<positive|neutral|negative>"
          }
          `.trim();
  }
}
