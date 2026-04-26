import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import type { EmailEntity, PromoCodeConfigurationEntity } from 'src/database/schema';
import { PromoCodeConfigurationsRepository } from 'src/database/repos/promo-code-configurations.repository';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { WooCommerceRestApiService } from 'src/modules/woocommerce/woocommerce-rest-api.service';
import { AgentsService } from 'src/modules/agents/agents.service';
import { MessageFormattingHelper } from '../../shared/message-formatting.helper';

/**
 * Sub-intents for the Promo Code Agent. Each maps to one of the four customer
 * scenarios described in the agent specification:
 *   - missed_promo_refund: customer paid full price and now wants the discount honored.
 *   - first_time_denied: existing customer tries to reuse a first-time-only code.
 *   - application_guidance: customer cannot find where to enter the code at checkout.
 *   - general_inquiry: customer asks about availability/validity (often new customers).
 *   - unclear: classifier could not commit; agent escalates.
 */
export const promoCodeIntentTypes = [
  'missed_promo_refund',
  'first_time_denied',
  'application_guidance',
  'general_inquiry',
  'unclear',
] as const;
export type PromoCodeIntent = (typeof promoCodeIntentTypes)[number];

export interface PromoCodeIntentResult {
  intent: PromoCodeIntent;
  confidence: number;
  mentionedCode: string | null;
  mentionedOrderNumbers: string[];
  customerQuery: string;
  reasoning: string;
}

export interface FirstTimeAssessment {
  isFirstTime: boolean;
  priorOrderCount: number;
  priorOrderIds: string[];
  matchedByEmail: boolean;
  matchedByBillingAddress: boolean;
  /**
   * Returned when we successfully identified the customer's most recent order. Useful
   * downstream for refund processing without requiring a second API call.
   */
  mostRecentOrderId: string | null;
}

/**
 * Discriminator on `PromoCodeRefundEligibility.kind` that tells the resolution
 * sub-workflow how to handle each ineligibility case.
 *
 * Two families:
 *   - "Soft refusals" can be answered directly by the agent with a polite, scenario-
 *     specific reply and the workflow completes normally (no human intervention).
 *     Currently only `subscription_excluded` is wired up for soft handling.
 *   - "Hard refusals" require human review and are escalated to the AI Team Center.
 *     These cover security-sensitive cases (ownership mismatch), data anomalies
 *     (order not found, zero amount), and configuration mistakes (hard ceiling).
 *
 * When in doubt, treat a kind as a hard refusal — escalation is the safer default.
 */
export type PromoCodeRefundIneligibilityKind =
  | 'subscription_excluded'
  | 'already_refunded'
  | 'ownership_mismatch'
  | 'status_ineligible'
  | 'no_stacking'
  | 'outside_validity_window'
  | 'below_minimum'
  | 'zero_amount'
  | 'order_not_found'
  | 'other';

export interface PromoCodeRefundEligibility {
  eligible: boolean;
  reason: string;
  /**
   * Populated only when `eligible === false`. Lets the resolution sub-workflow choose
   * between a soft auto-reply and a hard escalation without parsing the reason string.
   */
  kind?: PromoCodeRefundIneligibilityKind;
  proposedRefundAmount: string;
  cappedByMaxRefund: boolean;
  alreadyRefundedAmount: string;
  orderTotal: string;
  orderSubtotal: string;
  promoCode: string;
}

export interface PromoCodeAgentSettings {
  /**
   * Merchant-authored tone hint used when generating the Scenario 2 first-time-denied
   * reply. Null means use the agent's default plain-spoken style.
   */
  existingCustomerDenialNote: string | null;
}

interface WooCommerceOrderLite {
  id: number | string;
  total?: string;
  subtotal?: string;
  status?: string;
  date_created_gmt?: string | null;
  /**
   * Provided by WooCommerce on every order. Renewal/resubscribe/switch orders created by
   * WC Subscriptions report `created_via: "subscription"`. Initial subscription parent
   * orders are typically `created_via: "checkout"` but carry subscription meta keys, so
   * we ALSO inspect meta_data to catch the parent-order case.
   */
  created_via?: string;
  meta_data?: Array<{ key?: string; value?: unknown }>;
  refunds?: Array<{ id?: number | string; total?: string; reason?: string }>;
  coupon_lines?: Array<{ code?: string }>;
  billing?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  line_items?: Array<{ subtotal?: string; total?: string }>;
}

const FIRST_TIME_ORDER_STATUSES = new Set([
  'completed',
  'processing',
  'on-hold',
  'refunded',
  'pending',
]);

/**
 * Whitelist of order statuses that may receive a promo code refund. We use a whitelist
 * (rather than a blocklist) so unrecognized future statuses default to ineligible — the
 * safer failure mode. `pending` is excluded because the order has not been paid yet, so
 * there is nothing to refund. `cancelled`, `refunded`, `failed`, `trash` are excluded
 * because they are terminal "do not modify" states.
 */
const REFUND_ELIGIBLE_ORDER_STATUSES = new Set(['completed', 'processing', 'on-hold']);

/**
 * Detects refunds previously created by the Promo Code Agent. We rely on the canonical
 * reason string written by `pcProcessRefund`, which always starts with "Promo code refund".
 * This is what makes the agent idempotent: a second customer email asking for the same
 * (or a different) promo refund on the same order is rejected at eligibility time.
 */
const PROMO_REFUND_REASON_PATTERN = /^Promo code refund/i;

@Injectable()
@Activity()
export class PromoCodeActivities {
  private readonly logger = new Logger(PromoCodeActivities.name);

  constructor(
    private readonly promoCodeConfigsRepo: PromoCodeConfigurationsRepository,
    private readonly systemSettingsRepository: SystemSettingsRepository,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
    private readonly agentsService: AgentsService,
    private readonly messageFormattingHelper: MessageFormattingHelper,
  ) {}

  @ActivityMethod({ name: 'pcGetActiveConfigurations' })
  async pcGetActiveConfigurations(userId: string): Promise<PromoCodeConfigurationEntity[]> {
    const all = await this.promoCodeConfigsRepo.listByUserId(userId);
    return all.filter((c) => c.isActive);
  }

  @ActivityMethod({ name: 'pcGetAgentSettings' })
  async pcGetAgentSettings(userId: string): Promise<PromoCodeAgentSettings> {
    const settings = await this.systemSettingsRepository.findByUser(userId);
    return {
      existingCustomerDenialNote: settings?.promoCodeExistingCustomerDenialNote ?? null,
    };
  }

  /**
   * AI-driven intent classification scoped to the Promo Code Agent. We pass the
   * configured promo codes so the model can recognize references even when the
   * customer abbreviates them or omits the # symbol. The prompt is written to also
   * surface order numbers so the resolution sub-workflow can short-circuit refund
   * lookups without re-running the generic order extraction activity.
   */
  @ActivityMethod({ name: 'pcClassifyIntent' })
  async pcClassifyIntent(
    email: EmailEntity,
    configuredPromoCodes: string[],
  ): Promise<PromoCodeIntentResult> {
    const codesList = configuredPromoCodes.length
      ? configuredPromoCodes.map((c) => `- ${c}`).join('\n')
      : '- (no promo codes configured)';

    const prompt = `
You classify customer emails sent to a WooCommerce store about promo / discount codes.

Configured promo codes for this merchant:
${codesList}

Choose ONE intent from this list:

1. missed_promo_refund — Customer placed an order but forgot to apply a promo code at checkout and is now asking for the discount/refund.
2. first_time_denied — Customer tried using a first-time-only promo code, was denied because they are already a customer, and is now confused/upset.
3. application_guidance — Customer has a promo code but cannot find where to enter it during checkout (or asks where/how to apply).
4. general_inquiry — Customer is asking about availability/validity ("Do you have any discounts?", "Is SAVE20 still active?"). Includes new customers asking for a first-time code.
5. unclear — The intent is ambiguous, the email contains multiple unrelated requests, or none of the above match.

Also extract:
- mentionedCode: the promo code text the customer references (verbatim, without quotes), or null if they did not name a code.
- mentionedOrderNumbers: any order/invoice numbers referenced in the email (without the # prefix).
- customerQuery: a one-sentence summary of what the customer is asking for.
- confidence: integer 0-100 of how certain you are in the chosen intent.
- reasoning: one short sentence explaining your choice.

Email Subject: ${email.subject || 'N/A'}
From: ${email.fromEmail}
Body:
${email.body}

Return JSON ONLY:
{
  "intent": "<one of: missed_promo_refund | first_time_denied | application_guidance | general_inquiry | unclear>",
  "confidence": <0-100>,
  "mentionedCode": <string|null>,
  "mentionedOrderNumbers": <string[]>,
  "customerQuery": "<one-sentence summary>",
  "reasoning": "<short explanation>"
}`.trim();

    const messages = [
      {
        role: 'system',
        content:
          'You classify customer emails about promo / discount codes for an e-commerce store. Be conservative: prefer "unclear" over guessing.',
      },
      { role: 'user', content: prompt },
    ];

    const response = await this.agentsService['openaiService'].createChatCompletion(messages, 0.2, {
      type: 'json_object',
    });

    const raw = JSON.parse(response.choices[0].message.content || '{}');
    return {
      intent: this.normalizeIntent(raw.intent),
      confidence: Number(raw.confidence ?? 0),
      mentionedCode: typeof raw.mentionedCode === 'string' ? raw.mentionedCode.trim() : null,
      mentionedOrderNumbers: Array.isArray(raw.mentionedOrderNumbers)
        ? raw.mentionedOrderNumbers.map((value: unknown) => String(value))
        : [],
      customerQuery:
        typeof raw.customerQuery === 'string' ? raw.customerQuery : 'Promo code inquiry',
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
    };
  }

  @ActivityMethod({ name: 'pcResolveConfigByCode' })
  async pcResolveConfigByCode(
    userId: string,
    code: string | null,
  ): Promise<PromoCodeConfigurationEntity | null> {
    if (!code) return null;
    return this.promoCodeConfigsRepo.findActiveByCode(userId, code.trim());
  }

  /**
   * Differentiates first-time customers from returning customers by:
   *   1. Searching WooCommerce orders for the inbound email address.
   *   2. If no orders found and a billing address is supplied, scanning the most recent
   *      orders for an exact normalized billing address match (catches cases where the
   *      customer placed prior orders under a different email but the same address).
   *
   * The result drives Scenario 2 (deny first-time-only code reuse) and the eligibility
   * pre-check inside Scenario 1 (refund processing).
   */
  @ActivityMethod({ name: 'pcAssessFirstTimeCustomer' })
  async pcAssessFirstTimeCustomer(
    userId: string,
    inboundEmail: string,
    candidateBillingAddress?: WooCommerceOrderLite['billing'] | null,
  ): Promise<FirstTimeAssessment> {
    const normalizedEmail = this.normalizeEmail(inboundEmail);
    if (!normalizedEmail) {
      return {
        isFirstTime: true,
        priorOrderCount: 0,
        priorOrderIds: [],
        matchedByEmail: false,
        matchedByBillingAddress: false,
        mostRecentOrderId: null,
      };
    }

    const ordersByEmail = await this.fetchCustomerOrdersByEmail(userId, normalizedEmail);
    const matchedOrders = ordersByEmail.filter((order) =>
      FIRST_TIME_ORDER_STATUSES.has((order.status ?? '').toLowerCase()),
    );

    if (matchedOrders.length > 0) {
      return {
        isFirstTime: matchedOrders.length === 0,
        priorOrderCount: matchedOrders.length,
        priorOrderIds: matchedOrders.map((order) => String(order.id)),
        matchedByEmail: true,
        matchedByBillingAddress: false,
        mostRecentOrderId: String(matchedOrders[0].id),
      };
    }

    // Fallback: try to detect the same person under a different email by comparing
    // billing addresses. We only run this when the caller provides a billing address
    // (typically extracted from the inbound email or from a referenced order).
    if (candidateBillingAddress) {
      const recent = await this.wooCommerceRestApiService.getOrders(userId, { perPage: 100 });
      const normalizedTarget = this.normalizeAddress(candidateBillingAddress);
      const matchByAddress = (recent as WooCommerceOrderLite[]).filter((order) => {
        if (!FIRST_TIME_ORDER_STATUSES.has((order.status ?? '').toLowerCase())) return false;
        return this.normalizeAddress(order.billing) === normalizedTarget;
      });

      if (matchByAddress.length > 0) {
        return {
          isFirstTime: false,
          priorOrderCount: matchByAddress.length,
          priorOrderIds: matchByAddress.map((order) => String(order.id)),
          matchedByEmail: false,
          matchedByBillingAddress: true,
          mostRecentOrderId: String(matchByAddress[0].id),
        };
      }
    }

    return {
      isFirstTime: true,
      priorOrderCount: 0,
      priorOrderIds: [],
      matchedByEmail: false,
      matchedByBillingAddress: false,
      mostRecentOrderId: null,
    };
  }

  /**
   * Computes the refund amount that would be issued for a "missed promo code" claim.
   *
   * Rules:
   *   - Percentage codes refund (orderSubtotal * percentage / 100), capped at maxRefundAmount.
   *   - Fixed-amount codes refund maxRefundAmount directly.
   *   - We never refund more than (orderTotal - alreadyRefundedAmount) so partially refunded
   *     orders cannot overdraw.
   *   - We enforce minimumOrderValue and validUntil from the configuration.
   *
   * The maxRefundAmount cap is the merchant's safety net per scenario 5: large orders
   * from returning customers stay below the configured threshold to protect the business.
   */
  @ActivityMethod({ name: 'pcCheckRefundEligibility' })
  async pcCheckRefundEligibility(
    userId: string,
    orderId: string,
    config: PromoCodeConfigurationEntity,
  ): Promise<PromoCodeRefundEligibility> {
    const order = (await this.wooCommerceRestApiService.getOrderById(
      userId,
      orderId,
    )) as WooCommerceOrderLite;

    if (!order) {
      return this.refundIneligible(
        config.promoCode,
        'Order not found in WooCommerce',
        'order_not_found',
        '0',
        '0',
        '0',
      );
    }

    const orderTotal = parseFloat(order.total ?? '0');
    const subtotal = this.computeSubtotal(order);
    const alreadyRefunded = (order.refunds ?? [])
      .map((r) => parseFloat(r.total ?? '0'))
      .reduce((sum, value) => sum + Math.abs(value), 0);

    // NOTE: We intentionally do NOT enforce an "inbound email must equal order's billing
    // email" check. Customers regularly contact support from a different inbox than the
    // one they used at checkout (work vs personal email, plus-aliases, migrated accounts).
    // Eligibility is verified through the order itself + the first-time-customer check
    // (which uses the order's billing email, not the inbound sender), so identity
    // protection comes from those layers — and the refund itself goes back to the
    // original payment method on the order, not to the requester.

    // Guard 1: order must be in a status where a refund makes sense. Pending orders
    // are unpaid; cancelled/refunded/failed orders are terminal.
    const orderStatus = (order.status ?? '').toLowerCase();
    if (!REFUND_ELIGIBLE_ORDER_STATUSES.has(orderStatus)) {
      return this.refundIneligible(
        config.promoCode,
        `Order status "${orderStatus}" is not eligible for promo code refunds`,
        'status_ineligible',
        '0',
        orderTotal.toFixed(2),
        subtotal.toFixed(2),
        alreadyRefunded.toFixed(2),
      );
    }

    // Guard 2 (idempotency): if the agent has already issued a promo code refund on
    // this order, refuse. Blocks both the "ask twice for the same code" attack and the
    // "stack different codes via separate emails" attack. The resolution sub-workflow
    // handles this kind as a SOFT REFUSAL — the customer gets a polite confirmation
    // of the prior refund instead of an escalation.
    const priorPromoRefunds = (order.refunds ?? []).filter((refund) =>
      PROMO_REFUND_REASON_PATTERN.test(refund.reason ?? ''),
    );
    if (priorPromoRefunds.length > 0) {
      return this.refundIneligible(
        config.promoCode,
        `A promo code refund has already been issued for order #${orderId}; only one promo code refund per order is permitted`,
        'already_refunded',
        '0',
        orderTotal.toFixed(2),
        subtotal.toFixed(2),
        alreadyRefunded.toFixed(2),
      );
    }

    // Guard 3: prevent stacking on top of a coupon already applied at checkout. If the
    // customer used any coupon (this code or a different one) at checkout, we will not
    // also refund this code.
    if (Array.isArray(order.coupon_lines) && order.coupon_lines.length > 0) {
      const appliedCodes = order.coupon_lines.map((line) => line.code).filter(Boolean);
      return this.refundIneligible(
        config.promoCode,
        `Order #${orderId} already had coupon(s) applied at checkout (${appliedCodes.join(', ')}); promo code refund declined to prevent discount stacking`,
        'no_stacking',
        '0',
        orderTotal.toFixed(2),
        subtotal.toFixed(2),
        alreadyRefunded.toFixed(2),
      );
    }

    // Guard 4: subscription-eligibility honors the merchant's `appliesToSubscriptions`
    // configuration. WC Subscriptions surfaces three distinct order kinds:
    //   - parent orders (initial purchase) → meta key `_subscription_renewal` is absent
    //   - renewal orders → `created_via: "subscription"` and meta `_subscription_renewal`
    //   - resubscribe/switch orders → meta keys `_subscription_resubscribe` / `_subscription_switch`
    // If the merchant explicitly opted the promo OUT of subscriptions, refuse for every
    // subscription-related order kind to avoid refunding renewals on a "first-order-only"
    // style promo.
    //
    // This kind is a SOFT REFUSAL: the resolution sub-workflow generates a polite reply
    // explaining the policy and completes normally instead of escalating.
    if (config.appliesToSubscriptions === false && this.isSubscriptionOrder(order)) {
      return this.refundIneligible(
        config.promoCode,
        `Order #${orderId} is a subscription order, but promo code "${config.promoCode}" is configured to not apply to subscriptions`,
        'subscription_excluded',
        '0',
        orderTotal.toFixed(2),
        subtotal.toFixed(2),
        alreadyRefunded.toFixed(2),
      );
    }

    // Guard 5: the order must have been placed while the promo code was active. The
    // previous "promo currently expired" check was too aggressive (it rejected refunds
    // on orders placed legitimately during the active window if the customer waited too
    // long to email). The semantically correct check is order-date vs the validity
    // window. The merchant can still hard-disable a code via `isActive=false`, which
    // is enforced earlier in the workflow by the resolve-config action.
    const orderCreatedAt = order.date_created_gmt ? new Date(order.date_created_gmt) : null;
    if (orderCreatedAt && config.validFrom && orderCreatedAt < new Date(config.validFrom)) {
      return this.refundIneligible(
        config.promoCode,
        `Order was placed on ${orderCreatedAt.toDateString()} — before the promo code became valid (${new Date(config.validFrom).toDateString()})`,
        'outside_validity_window',
        '0',
        orderTotal.toFixed(2),
        subtotal.toFixed(2),
        alreadyRefunded.toFixed(2),
      );
    }
    if (orderCreatedAt && config.validUntil && orderCreatedAt > new Date(config.validUntil)) {
      return this.refundIneligible(
        config.promoCode,
        `Order was placed on ${orderCreatedAt.toDateString()} — after the promo code expired (${new Date(config.validUntil).toDateString()})`,
        'outside_validity_window',
        '0',
        orderTotal.toFixed(2),
        subtotal.toFixed(2),
        alreadyRefunded.toFixed(2),
      );
    }

    const minimumOrderValue = config.minimumOrderValue ? parseFloat(config.minimumOrderValue) : 0;
    if (minimumOrderValue > 0 && subtotal < minimumOrderValue) {
      return this.refundIneligible(
        config.promoCode,
        `Order subtotal $${subtotal.toFixed(2)} is below the configured minimum of $${minimumOrderValue.toFixed(2)}`,
        'below_minimum',
        '0',
        orderTotal.toFixed(2),
        subtotal.toFixed(2),
      );
    }

    const cap = config.maxRefundAmount ? parseFloat(config.maxRefundAmount) : Infinity;
    let proposedRefund = 0;

    if (config.discountType === 'percentage') {
      const pct = config.discountPercentage ? parseFloat(config.discountPercentage) : 0;
      proposedRefund = (subtotal * pct) / 100;
    } else if (config.discountType === 'fixed_amount') {
      proposedRefund = Number.isFinite(cap) ? cap : 0;
    }

    const cappedByMaxRefund = Number.isFinite(cap) && proposedRefund > cap;
    if (cappedByMaxRefund) proposedRefund = cap;

    const remainingRefundable = Math.max(orderTotal - alreadyRefunded, 0);
    if (proposedRefund > remainingRefundable) {
      proposedRefund = remainingRefundable;
    }

    if (proposedRefund <= 0) {
      const isAlreadyRefunded = alreadyRefunded > 0;
      return this.refundIneligible(
        config.promoCode,
        isAlreadyRefunded
          ? 'Order has already been fully or sufficiently refunded'
          : 'Calculated refund amount is zero',
        isAlreadyRefunded ? 'already_refunded' : 'zero_amount',
        '0',
        orderTotal.toFixed(2),
        subtotal.toFixed(2),
        alreadyRefunded.toFixed(2),
      );
    }

    return {
      eligible: true,
      reason: cappedByMaxRefund
        ? `Refund capped at the configured maximum of $${cap.toFixed(2)}`
        : 'Within configured limits',
      proposedRefundAmount: proposedRefund.toFixed(2),
      cappedByMaxRefund,
      alreadyRefundedAmount: alreadyRefunded.toFixed(2),
      orderTotal: orderTotal.toFixed(2),
      orderSubtotal: subtotal.toFixed(2),
      promoCode: config.promoCode,
    };
  }

  @ActivityMethod({ name: 'pcProcessRefund' })
  async pcProcessRefund(
    userId: string,
    orderId: string,
    amount: string,
    promoCode: string,
  ): Promise<{ refundId: string; amount: string }> {
    const refund = await this.wooCommerceRestApiService.createOrderRefund(userId, orderId, {
      amount,
      reason: `Promo code refund (${promoCode}) issued by Delight Desk`,
      apiRefund: true,
      restockRefundedItems: false,
    });
    return { refundId: String(refund?.id ?? ''), amount };
  }

  @ActivityMethod({ name: 'pcGetMostRecentOrderByEmail' })
  async pcGetMostRecentOrderByEmail(userId: string, email: string): Promise<any> {
    return this.wooCommerceRestApiService.getMostRecentOrderByEmail(userId, email);
  }

  @ActivityMethod({ name: 'pcGenerateMissedRefundMessage' })
  async pcGenerateMissedRefundMessage(input: {
    customerName: string;
    promoCode: string;
    orderNumber: string;
    refundAmount: string;
    cappedByMaxRefund: boolean;
    aiIdentity?: any;
  }): Promise<string> {
    const { customerName, promoCode, orderNumber, refundAmount, cappedByMaxRefund, aiIdentity } =
      input;
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
Confirm a promo code refund. Customer forgot to apply ${promoCode} on order #${orderNumber}; we just refunded $${refundAmount}.

Cap Applied: ${cappedByMaxRefund ? 'yes' : 'no'}

Write a short, plain-spoken confirmation that:
1. Gets straight to the point in the FIRST sentence — say what we did (applied the code, refunded $X to their card).
2. Mentions order #${orderNumber} and the code ${promoCode} once, naturally.
3. ${cappedByMaxRefund ? `Adds one short matter-of-fact sentence noting $${refundAmount} is the most this promo refunds per order.` : 'Skips any mention of caps or limits.'}
4. Notes the refund usually shows up in 5-10 business days depending on the bank.
5. Maximum 60 tokens. Aim shorter rather than longer.
6. No salutation, no signature, no customer name (the formatter adds those).

Style rules — DO NOT VIOLATE:
- Sound like a quick note from a real person, not a brand or template.
- Use contractions naturally (we've, you'll, that's).
- BANNED phrases: "we apologize", "we're sorry for any inconvenience", "we're pleased to confirm", "thank you for your understanding", "thank you for your patience", "thank you for your continued support", "should you have any further questions", "please don't hesitate", "we appreciate your business".
- This is a routine fix, not an apology. No flowery language.
${voiceContext}
`.trim();

    return this.runAiAndFormat(prompt, customerName, aiIdentity, 'promo refund confirmation');
  }

  @ActivityMethod({ name: 'pcGenerateFirstTimeDeniedMessage' })
  async pcGenerateFirstTimeDeniedMessage(input: {
    customerName: string;
    promoCode: string | null;
    priorOrderCount: number;
    customDenialNote: string | null;
    aiIdentity?: any;
  }): Promise<string> {
    const { customerName, promoCode, priorOrderCount, customDenialNote, aiIdentity } = input;
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
A returning customer (${priorOrderCount} prior order${priorOrderCount === 1 ? '' : 's'} with us) tried to use ${promoCode ? `the code ${promoCode}` : 'a promo code'} that's reserved for first-time customers only. Explain briefly why it didn't work.

${customDenialNote ? `Merchant tone note (follow this voice closely): ${customDenialNote}` : ''}

Write a short, plain-spoken response that:
1. In ONE sentence, say the code is for first-time customers only — that's why it didn't go through.
2. ${customDenialNote ? 'Reflect the merchant tone note above.' : "Briefly acknowledges they're a returning customer, no gushing."}
3. Optional one-liner pointing them to where they can see future promotions (newsletter, etc.) — only if it fits naturally.
4. Maximum 70 tokens. Aim shorter rather than longer.
5. No salutation, no signature, no customer name (the formatter adds those).

Style rules — DO NOT VIOLATE:
- Sound like a real person writing a quick reply, not a brand statement.
- Use contractions naturally.
- BANNED phrases: "we apologize for any inconvenience", "we appreciate your continued business", "thank you for your understanding", "we're sorry for any confusion", "we value your loyalty", "please don't hesitate".
- Don't be sycophantic. Don't gush about how much we love loyal customers.
${voiceContext}
`.trim();

    return this.runAiAndFormat(
      prompt,
      customerName,
      aiIdentity,
      'first-time promo denial explanation',
    );
  }

  /**
   * Generates an application-guidance reply that's grounded in the merchant's product
   * knowledge base. The workflow is responsible for retrieving relevant chunks (via
   * `retrieveProductKnowledgeContext` from the Product Agent activities) and passing
   * them in here. If no relevant chunks were found the workflow escalates instead of
   * calling this activity, so the model never has to guess about checkout flows.
   */
  @ActivityMethod({ name: 'pcGenerateApplicationGuidanceFromKnowledge' })
  async pcGenerateApplicationGuidanceFromKnowledge(input: {
    customerName: string;
    customerQuery: string;
    promoCode: string | null;
    knowledgeChunks: Array<{
      sourceTitle: string;
      sourceUrl: string | null;
      content: string;
      similarity: number;
    }>;
    aiIdentity?: any;
  }): Promise<string> {
    const { customerName, customerQuery, promoCode, knowledgeChunks, aiIdentity } = input;
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const knowledgeContext = knowledgeChunks
      .map(
        (chunk, index) =>
          `[Source ${index + 1}: ${chunk.sourceTitle}${chunk.sourceUrl ? ` — ${chunk.sourceUrl}` : ''}]\n${chunk.content}`,
      )
      .join('\n\n---\n\n');

    const prompt = `
Tell a customer where/how to apply ${promoCode ? `the promo code ${promoCode}` : 'a promo code'} at checkout, grounded ONLY in the merchant's documentation snippets below.

Customer's question:
${customerQuery}

Merchant documentation snippets (treat these as the source of truth):
${knowledgeContext}

Write a short, plain-spoken response that:
1. Answers the customer's question directly using ONLY information from the snippets above.
2. If multiple steps exist (e.g. "click X, then Y"), include them but stay concise.
3. Optionally mention the discount applies automatically once entered, only if the snippets back this up.
4. One short closing line: tell them to reply if it still doesn't work.
5. Maximum 90 tokens. Aim shorter rather than longer.
6. No salutation, no signature, no customer name (the formatter adds those).

Style rules — DO NOT VIOLATE:
- Sound like a quick helpful note, not a corporate FAQ entry.
- Use contractions naturally.
- Do NOT invent details that aren't in the snippets. If the snippets don't actually say where to apply a code, write "I want to make sure I get this right — let me check with the team and get back to you" so it can be escalated; do not guess.
- BANNED phrases: "thank you for reaching out", "we appreciate your interest", "please don't hesitate to contact us", "we're happy to help".
- Don't repeat the customer's question back to them. Just answer it.
${voiceContext}
`.trim();

    return this.runAiAndFormat(
      prompt,
      customerName,
      aiIdentity,
      'promo application guidance grounded in product knowledge',
    );
  }

  @ActivityMethod({ name: 'pcGenerateGeneralInquiryMessage' })
  async pcGenerateGeneralInquiryMessage(input: {
    customerName: string;
    isFirstTime: boolean;
    activePromoCodes: Array<{
      code: string;
      description: string | null;
      discountType: string;
      discountPercentage: string | null;
      maxRefundAmount: string | null;
      validUntil: string | null;
      usageType: string;
    }>;
    aiIdentity?: any;
  }): Promise<string> {
    const { customerName, isFirstTime, activePromoCodes, aiIdentity } = input;
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const eligibleCodes = activePromoCodes.filter((c) => {
      if (c.usageType === 'refund_only') return false;
      if (c.usageType === 'first_time_customer_discount') return isFirstTime;
      return true;
    });

    const codesContext = eligibleCodes.length
      ? eligibleCodes
          .map(
            (c) =>
              `- ${c.code}: ${c.description ?? 'No description'} (${c.discountType === 'percentage' ? `${c.discountPercentage}% off` : `$${c.maxRefundAmount} off`}${c.validUntil ? `, valid until ${new Date(c.validUntil).toDateString()}` : ''})`,
          )
          .join('\n')
      : '(no codes the customer is currently eligible for)';

    const prompt = `
A ${isFirstTime ? 'first-time' : 'returning'} customer is asking about current discounts.

Codes the customer is eligible for:
${codesContext}

Write a short, plain-spoken response that:
1. ${eligibleCodes.length ? 'Names ONE relevant code in the first sentence, says the discount in plain terms (e.g. "10% off"), and notes any expiry or minimum spend in one short clause.' : "Says nothing's running right now, and offers a quick way to hear about future ones (newsletter, etc.)."}
2. ${isFirstTime && eligibleCodes.length ? "Briefly mentions it's their welcome offer for a first order." : ''}
3. Maximum 70 tokens. Aim shorter rather than longer.
4. No salutation, no signature, no customer name (the formatter adds those).

Style rules — DO NOT VIOLATE:
- Sound like a quick honest reply, not a marketing blast.
- Use contractions naturally.
- BANNED phrases: "thank you for your interest", "we appreciate", "we're so glad you reached out", "please don't hesitate", "should you have any questions".
- Don't oversell. Don't say "amazing" or "exciting" or "incredible". Just state what's available.
${voiceContext}
`.trim();

    return this.runAiAndFormat(prompt, customerName, aiIdentity, 'promo general inquiry');
  }

  /**
   * Generates a customer-facing reply for the soft-refusal "already refunded" case:
   * the customer asked us to apply a promo code on an order that already has an
   * agent-issued promo refund. The reply confirms the prior refund (with amount, so
   * the customer doesn't think we ignored them) and reminds them about typical
   * settlement times. Avoids re-issuing the refund.
   */
  @ActivityMethod({ name: 'pcGenerateAlreadyRefundedMessage' })
  async pcGenerateAlreadyRefundedMessage(input: {
    customerName: string;
    promoCode: string;
    orderNumber: string;
    alreadyRefundedAmount: string;
    aiIdentity?: any;
  }): Promise<string> {
    const { customerName, promoCode, orderNumber, alreadyRefundedAmount, aiIdentity } = input;
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
A customer is asking us (again) to apply ${promoCode} to order #${orderNumber}, but we already issued a promo code refund of $${alreadyRefundedAmount} on that order. Confirm the prior refund so they understand it's already been handled.

Write a short, plain-spoken reply that:
1. In the FIRST sentence, confirm we already applied ${promoCode} to order #${orderNumber} and refunded $${alreadyRefundedAmount}.
2. Note the refund typically lands in 5-10 business days from when it was issued, depending on the bank.
3. Add one short line inviting them to reply if they don't see it after that window.
4. Maximum 70 tokens. Aim shorter rather than longer.
5. No salutation, no signature, no customer name (the formatter adds those).

Style rules — DO NOT VIOLATE:
- Sound like a real person clarifying, not a script reading back a policy.
- Use contractions naturally.
- BANNED phrases: "we apologize", "unfortunately", "we're sorry for any inconvenience", "thank you for your patience", "thank you for your understanding", "please don't hesitate", "we appreciate".
- Don't sound dismissive — the customer probably forgot, that's fine. Just confirm and reassure.
${voiceContext}
`.trim();

    return this.runAiAndFormat(
      prompt,
      customerName,
      aiIdentity,
      'already-refunded promo confirmation',
    );
  }

  /**
   * Generates a customer-facing reply for the soft-refusal subscription case: the
   * customer asked us to apply a promo code on a subscription order, but the
   * promo's `appliesToSubscriptions=false` setting excludes them. Instead of
   * escalating, the agent answers the customer directly with this message.
   */
  @ActivityMethod({ name: 'pcGenerateSubscriptionExcludedMessage' })
  async pcGenerateSubscriptionExcludedMessage(input: {
    customerName: string;
    promoCode: string;
    orderNumber: string;
    aiIdentity?: any;
  }): Promise<string> {
    const { customerName, promoCode, orderNumber, aiIdentity } = input;
    const voiceContext = this.messageFormattingHelper.buildVoiceAndSettingsContext(aiIdentity);

    const prompt = `
A customer asked us to apply promo code ${promoCode} on order #${orderNumber}, but ${promoCode} is configured to apply only to one-time orders, not subscription renewals. Order #${orderNumber} is a subscription order, so the discount cannot be applied.

Write a short, plain-spoken reply that:
1. Says in the FIRST sentence that ${promoCode} is for one-time orders only and doesn't apply to subscription renewals like #${orderNumber}.
2. Optionally adds a one-line offer to help with anything else.
3. Maximum 60 tokens. Aim shorter rather than longer.
4. No salutation, no signature, no customer name (the formatter adds those).

Style rules — DO NOT VIOLATE:
- Sound like a real person delivering the policy, not apologizing or reading a script.
- Use contractions naturally.
- BANNED phrases: "we apologize", "unfortunately", "we're sorry for any inconvenience", "we appreciate your understanding", "thank you for your patience", "please don't hesitate".
- Don't be sycophantic. Don't pad with niceties. Just state the policy clearly.
${voiceContext}
`.trim();

    return this.runAiAndFormat(
      prompt,
      customerName,
      aiIdentity,
      'subscription-ineligible promo notice',
    );
  }

  private async runAiAndFormat(
    prompt: string,
    customerName: string,
    aiIdentity: any,
    role: string,
  ): Promise<string> {
    // House style for every promo code response: short, plain American English. Models
    // default to florid corporate-customer-service tone unless explicitly steered away.
    // We lower the temperature to 0.4 (down from 0.6) to reduce the chance of unrequested
    // pleasantries sneaking back in despite the BANNED phrases list in each prompt.
    const messages = [
      {
        role: 'system',
        content:
          `You are ${aiIdentity?.aiAgentName || 'a customer service rep'}${aiIdentity?.aiAgentTitle ? `, ${aiIdentity.aiAgentTitle},` : ''} writing a ${role}. ` +
          'Your replies are short, plain-spoken, and conversational — like a quick note from a real person, not a corporate template. ' +
          'American customers prefer this. Get to the point in the first sentence. Use contractions. Skip apology theatrics, gratitude rituals, and FAQ-style boilerplate. ' +
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

  private async fetchCustomerOrdersByEmail(
    userId: string,
    email: string,
  ): Promise<WooCommerceOrderLite[]> {
    try {
      // 100 orders per page is the WooCommerce maximum and is sufficient for most
      // first-time-customer checks; extra orders rarely change the boolean outcome.
      const orders = await this.wooCommerceRestApiService.getOrders(userId, { perPage: 100 });
      return (orders as WooCommerceOrderLite[]).filter(
        (order) => order.billing?.email?.toLowerCase() === email.toLowerCase(),
      );
    } catch (error) {
      this.logger.warn(
        `Falling back to empty order list for ${email} due to WooCommerce error: ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Detects subscription-related WooCommerce orders. Returns true for renewal,
   * resubscribe, switch, AND parent (initial purchase) subscription orders.
   *
   * Detection signals (any one is sufficient):
   *   - `created_via === "subscription"` — set by WC Subscriptions on renewals.
   *   - meta_data contains `_subscription_renewal` / `_subscription_resubscribe` /
   *     `_subscription_switch` — used on the relevant lifecycle order types.
   *   - meta_data contains `_subscription_parent` or any line item flagged as a
   *     subscription product (best-effort; some stores use only the meta marker).
   *
   * We deliberately err on the side of "yes, this is a subscription" so that a
   * merchant who set `appliesToSubscriptions=false` does not see refunds slip through
   * on parent orders that look like one-time purchases at first glance.
   */
  private isSubscriptionOrder(order: WooCommerceOrderLite): boolean {
    if ((order.created_via ?? '').toLowerCase() === 'subscription') return true;

    const metaKeys = new Set(
      (order.meta_data ?? [])
        .map((entry) => entry.key)
        .filter((key): key is string => typeof key === 'string'),
    );

    const subscriptionMetaMarkers = [
      '_subscription_renewal',
      '_subscription_resubscribe',
      '_subscription_switch',
      '_subscription_parent',
    ];

    return subscriptionMetaMarkers.some((marker) => metaKeys.has(marker));
  }

  private computeSubtotal(order: WooCommerceOrderLite): number {
    if (order.subtotal) return parseFloat(order.subtotal);
    if (Array.isArray(order.line_items)) {
      return order.line_items
        .map((line) => parseFloat(line.subtotal ?? line.total ?? '0'))
        .reduce((sum, value) => sum + value, 0);
    }
    return parseFloat(order.total ?? '0');
  }

  private normalizeIntent(value: unknown): PromoCodeIntent {
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if ((promoCodeIntentTypes as readonly string[]).includes(lower)) {
        return lower as PromoCodeIntent;
      }
    }
    return 'unclear';
  }

  private normalizeEmail(value: string): string | null {
    if (!value) return null;
    const match = value.match(/<([^>]+)>/);
    const candidate = (match ? match[1] : value).trim().toLowerCase();
    return candidate.includes('@') ? candidate : null;
  }

  private normalizeAddress(billing?: WooCommerceOrderLite['billing'] | null): string {
    if (!billing) return '';
    const parts = [
      billing.address_1,
      billing.address_2,
      billing.city,
      billing.state,
      billing.postcode,
      billing.country,
    ];
    return parts
      .filter(Boolean)
      .map((part) => String(part).trim().toLowerCase().replace(/\s+/g, ' '))
      .join('|');
  }

  private refundIneligible(
    promoCode: string,
    reason: string,
    kind: PromoCodeRefundIneligibilityKind,
    proposedRefundAmount: string,
    orderTotal: string,
    orderSubtotal: string,
    alreadyRefundedAmount: string = '0',
  ): PromoCodeRefundEligibility {
    return {
      eligible: false,
      reason,
      kind,
      proposedRefundAmount,
      cappedByMaxRefund: false,
      alreadyRefundedAmount,
      orderTotal,
      orderSubtotal,
      promoCode,
    };
  }
}
