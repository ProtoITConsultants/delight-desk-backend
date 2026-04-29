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
    return this.normalizeClassification(classification);
  }

  private buildClassificationPrompt(email: any): string {
    return `
          You are classifying an email that arrived in the support inbox of a merchant
          who runs a WooCommerce online store. Most legitimate emails will be from
          shoppers / customers of that store. Anything that is NOT a real shopper-support
          message must be tagged "out_of_scope" so it never reaches a support agent.

          CATEGORIES:

          1. **wismo** (WISMO - Where Is My Order)
          - Intent: Customer wants to know where their order is, when it will arrive, or why it hasn't arrived
          - Context: Any concern about order location, delivery timing, shipping progress
          - Examples: "Where is my order?", "Expected yesterday but not here", "Haven't received my package", "Order #123 status?"

          2. **subscription**
          - Intent: Customer wants to modify their ongoing subscription
          - Context: Pause, resume, cancel, change contents, modify schedule

          3. **product**
          - Intent: Customer has questions about product features or specifications of a product the store sells
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

          8. **out_of_scope**  ← USE THIS FOR ANYTHING NOT A REAL CUSTOMER SUPPORT EMAIL
          - Intent: The email is NOT a shopper-support message about the merchant's WooCommerce store, its products, or its orders.
          - Use this category whenever the email is any of the following:
            * B2B sales prospecting, cold outreach, or account-management follow-ups
              (e.g. SaaS vendors, ad platforms, payment processors, agencies, recruiters,
              "Account Manager" / "Account Executive" / "BDR" / "SDR" pitching their services)
            * Marketing newsletters, promotional blasts, vendor announcements, webinar invites,
              "schedule a meeting / book a demo" requests
            * Personal correspondence unrelated to the store (friends, family, internal chatter)
            * Job applications, partnership pitches, press / PR inquiries, sponsorship asks,
              guest-post / SEO / link-building outreach, influencer pitches
            * Spam, phishing, security scans, automated platform notifications
              (GitHub, Stripe receipts, AWS alerts, etc.) that are not from a shopper
            * Internal company emails (HR, payroll, IT, accounting) sent to the support address
            * Any message where the sender is clearly NOT acting as a shopper / customer
              of the merchant's store
          - Real-world tells: phrases like "monthly budget", "your launch", "schedule a meeting",
            "enroll in our webinar", "I'm reaching out from", "I noticed your company",
            "we help businesses like yours", "Account Manager" / "Account Executive" in the
            signature, sender domain belonging to a large vendor (google.com, salesforce.com,
            hubspot.com, klaviyo.com, etc.) when the body is a pitch rather than a transactional
            notification the shopper triggered.
          - When in doubt between a weak fit for a customer category vs. out_of_scope, prefer
            out_of_scope. It is much better to silently drop a sales pitch than to escalate it
            to a human as a "customer query".

          SCENARIO FLAGS (NOT CATEGORY):
          - escalation: true if customer requests human escalation OR shows high distress/threatening language
          - thankful: true if customer mainly expresses gratitude or positive appreciation
          - These are scenario overlays. They can coexist with any intent category EXCEPT out_of_scope
            (out_of_scope emails should always have both flags false).

          PRIORITY ASSESSMENT:
          - **urgent**: Human escalation requests, events tomorrow, damaged goods, safety issues
          - **high**: Delayed orders, upset customers, payment problems, billing disputes
          - **medium**: Standard requests, general order questions, subscription changes
          - **low**: Simple questions, compliments, product info requests, AND all out_of_scope emails

          ANALYSIS INSTRUCTIONS:
          1. First decide: is this a real shopper-support email about the merchant's WooCommerce store?
             If NO → category = "out_of_scope" and stop weighing the other categories.
          2. If YES, choose exactly one of the seven customer intent categories.
          3. Set scenario flags separately under scenarios.{escalation, thankful}.
          4. Read the email content to understand the underlying concern and emotional state.
          5. Consider context clues like order numbers, timing expressions, emotional language,
             sender domain, and signature.
          6. Assign appropriate priority based on urgency and customer sentiment.
          7. Be confident — modern AI should easily distinguish a customer query from a sales pitch.

          Email Details:
          Subject: ${email.subject || 'N/A'}
          From: ${email.fromEmail}
          Body: ${email.body}

          Return a JSON object with:
          {
            "category": "<wismo|subscription|product|returns|promo_code|address_change|order_cancellation|out_of_scope>",
            "confidence": <0-100>,
            "reasoning": "<brief explanation>",
            "priority": "<low|medium|high|urgent>",
            "sentiment": "<positive|neutral|negative>",
            "scenarios": {
              "escalation": <true|false>,
              "thankful": <true|false>
            }
          }
          `.trim();
  }

  private normalizeClassification(classification: ClassificationResult): ClassificationResult {
    return {
      ...classification,
      scenarios: {
        escalation: classification.scenarios?.escalation ?? false,
        thankful: classification.scenarios?.thankful ?? false,
      },
    };
  }
}
