import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

export interface ClassificationResult {
  classification: string;
  confidence: number;
  reasoning: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  priorityReasoning?: string;
}

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
  }

  async classifyEmail(emailContent: string, subject: string): Promise<ClassificationResult> {
    try {
      const prompt = `
        You are an expert customer service AI that understands customer intent, not just keywords. Analyze the underlying meaning and context of this email.

        CUSTOMER INTENT CATEGORIES:

        1. **order_status** (WISMO - Where Is My Order)
        - Intent: Customer wants to know where their order is, when it will arrive, or why it hasn't arrived
        - Context: Any concern about order location, delivery timing, shipping progress
        - Examples: "Where is my order?", "Expected yesterday but not here", "Haven't received my package", "Order #123 status?"

        2. **promo_refund** 
        - Intent: Customer wants money back or has billing/payment concerns
        - Context: Financial disputes, refund requests, charge issues

        3. **discount_inquiries**
        - Intent: Customer is asking about available discounts, promo codes, or special offers
        - Context: General discount requests, first-time customer inquiries, asking "Do you have any sales?", "Any coupons available?", "Can I get a discount?"
        - Examples: "Do you have any promo codes?", "Any discounts for new customers?", "Are there any sales happening?", "Can I get a coupon?"

        4. **order_cancellation**
        - Intent: Customer wants to stop an order before it ships
        - Context: Prevent shipment, cancel before processing

        5. **return_request**
        - Intent: Customer wants to exchange or return a received product
        - Context: Product exchanges, returns (not necessarily for refund)

        6. **subscription_changes**
        - Intent: Customer wants to modify their ongoing subscription
        - Context: Pause, resume, change contents, modify schedule

        7. **cancellation_requests**
        - Intent: Customer wants to end their subscription/account permanently
        - Context: Terminate service, close account

        8. **payment_issues**
        - Intent: Customer has problems with payment processing
        - Context: Failed payments, payment method issues

        9. **address_change**
        - Intent: Customer wants to change shipping address
        - Context: Update delivery location

        10. **product**
        - Intent: Customer has questions about product features or specifications
        - Context: Product information, compatibility, usage

        11. **escalation**
            - Intent: Customer is frustrated, threatening, or has complex multi-issue problems
            - Context: Complaints, legal threats, multiple failed attempts

        12. **human_escalation**
            - Intent: Customer explicitly requests human assistance or escalation
            - Context: Any variation of wanting to speak to a person, human agent, real person
            - Keywords/Phrases: "Human", "speak to someone", "real person", "human agent", "escalate", "transfer me", "I need a person", "connect me to someone", "I want to talk to a human", "get a human on the line"
            - Priority: ALWAYS urgent regardless of other factors

        13. **general**
            - Intent: Simple questions, compliments, basic inquiries
            - Context: Only use if no specific intent is clear

        PRIORITY ASSESSMENT:
        - **urgent**: Human escalation requests, events tomorrow, damaged goods, safety issues
        - **high**: Delayed orders, upset customers, payment problems, billing disputes  
        - **medium**: Standard requests, general order questions, subscription changes
        - **low**: Simple questions, compliments, product info requests

        ANALYSIS INSTRUCTIONS:
        1. **FIRST CHECK FOR HUMAN ESCALATION**: Look for any requests to speak to a human, real person, agent, or escalation - if found, classify as "human_escalation" with "urgent" priority
        2. Read the email content to understand the customer's underlying concern and emotional state
        3. Identify the primary intent - what does the customer actually want?
        4. Consider context clues like order numbers, timing expressions, emotional language
        5. Assign appropriate priority based on urgency and customer sentiment
        6. Be confident in your assessment - modern AI should easily understand customer intent

        Email Subject: ${subject}
        Email Content: ${emailContent}

        Respond with JSON:
        {
        "classification": "category_name",
        "confidence": 85,
        "reasoning": "Brief explanation of the customer's intent and why this classification matches",
        "priority": "urgent|high|medium|low", 
        "priorityReasoning": "Why this priority level was assigned based on urgency and customer sentiment"
        }
        `;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      return {
        classification: result.classification,
        confidence: result.confidence,
        reasoning: result.reasoning,
        priority: result.priority,
        priorityReasoning: result.priorityReasoning,
      };
    } catch (error) {
      console.error('Email classification error:', error);
      return {
        classification: 'general',
        confidence: 30,
        reasoning: 'Classification failed, defaulting to general',
        priority: 'medium',
        priorityReasoning: 'Default priority due to classification failure',
      };
    }
  }
}
