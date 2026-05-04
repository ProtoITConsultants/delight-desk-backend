/**
 * Promo Code Resolution Sub-Workflow
 * Phase 3: Branch on the classified intent and execute the appropriate handler:
 *   - missed_promo_refund   -> verify customer + eligibility, refund partial amount, confirm
 *   - first_time_denied     -> confirm customer is returning, send empathy/explanation
 *   - application_guidance  -> send merchant-customized guidance on where to enter the code
 *   - general_inquiry       -> share an eligible code (or politely state none available)
 */

import { condition, log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { OrderActivities } from '../../../../activities/shared/order.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import type { CustomerMessageActivities } from '../../../../activities/shared/customer-message.activities';
import type { ProductActivities } from '../../../../activities/agents/product/product.activities';
import type {
  PromoCodeActivities,
  PromoCodeRefundEligibility,
} from '../../../../activities/agents/promo-code/promo-code.activities';
import type { EmailEntity, PromoCodeConfigurationEntity } from '../../../../../../database/schema';
import {
  ActionExecutionContext,
  ActionStatus,
  EscalationError,
  EscalationType,
  PromoCodeActionType,
} from '../../../types';
import { executeWorkflowAction, extractCustomerName } from '../../../workflow-action.helpers';
import {
  ACTIVITY_TIMEOUTS,
  MAX_CUSTOMER_REPLY_WAIT_DAYS,
  PROMO_CODE_HARD_REFUND_CEILING,
  PROMO_KNOWLEDGE_MIN_TOP_SIMILARITY,
  PROMO_KNOWLEDGE_RETRIEVAL_DEFAULTS,
  SOFT_REFUSAL_KINDS,
} from '../promo-code.constants';
import { extractEmailAddress } from '../promo-code.helpers';
import { PromoCodeResolutionResult, PromoCodeWorkflowState } from '../promo-code.types';
import { buildPromoCodeFailureResult } from './promo-code-subworkflow.helpers';

const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const orderActivities = proxyActivities<typeof OrderActivities.prototype>(ACTIVITY_TIMEOUTS.ORDER);
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);
const messageActivities = proxyActivities<typeof CustomerMessageActivities.prototype>(
  ACTIVITY_TIMEOUTS.MESSAGE,
);
const productActivities = proxyActivities<typeof ProductActivities.prototype>(
  ACTIVITY_TIMEOUTS.PROMO,
);
const promoActivities = proxyActivities<typeof PromoCodeActivities.prototype>(
  ACTIVITY_TIMEOUTS.PROMO,
);

const { sendCustomerNotificationViaThread } = emailActivities;
const { extractOrderNumberFromEmail, getWooCommerceOrderById } = orderActivities;
const { getAiIdentity } = aiIdentityActivities;
const { generateOrderInfoRequestMessage } = messageActivities;
const { retrieveProductKnowledgeContext } = productActivities;
const EMAIL_IN_TEXT_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const {
  pcGetActiveConfigurations,
  pcAssessFirstTimeCustomer,
  pcCheckRefundEligibility,
  pcProcessRefund,
  pcGetMostRecentOrderByEmail,
  pcGenerateMissedRefundMessage,
  pcGenerateFirstTimeDeniedMessage,
  pcGenerateApplicationGuidanceFromKnowledge,
  pcGenerateGeneralInquiryMessage,
  pcGenerateSubscriptionExcludedMessage,
  pcGenerateAlreadyRefundedMessage,
  pcGenerateProductNotEligibleMessage,
} = promoActivities;

/**
 * Tries to recover an order id from a customer reply email. Looked up in three ways
 * (in order): AI extraction of an order number from the body, then a fallback
 * lookup by any email address mentioned in the reply, then a lookup by the original
 * inbound sender's email. Returns nothing on success — instead it sets
 * `state.resolvedOrderId` directly so the caller can re-check it after we return.
 */
async function resolveOrderFromCustomerReply(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
  replyEmail: EmailEntity,
): Promise<void> {
  const detection = await extractOrderNumberFromEmail(replyEmail);
  if (detection?.orderNumbers?.length) {
    context.state.resolvedOrderId = String(detection.orderNumbers[0]);
    return;
  }

  const emailMatch = replyEmail.body?.match(EMAIL_IN_TEXT_REGEX);
  const candidateEmail =
    (emailMatch ? emailMatch[0] : extractEmailAddress(context.email.fromEmail)) || '';
  if (candidateEmail) {
    const recent = await pcGetMostRecentOrderByEmail(context.userId, candidateEmail);
    if (recent?.id) {
      context.state.resolvedOrderId = String(recent.id);
    }
  }
}

export async function handlePromoCodeResolution(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
): Promise<PromoCodeResolutionResult> {
  const intent = context.state.intent;
  if (!intent) {
    throw new Error('Promo code resolution called before intent classification');
  }

  log.info('Routing Promo Code resolution', {
    intent: intent.intent,
    matchedConfigId: context.state.matchedConfig?.id ?? null,
  });

  switch (intent.intent) {
    case 'missed_promo_refund':
      return handleMissedPromoRefund(context);
    case 'first_time_denied':
      return handleFirstTimeDenied(context);
    case 'application_guidance':
      return handleApplicationGuidance(context);
    case 'general_inquiry':
      return handleGeneralInquiry(context);
    default:
      throw new EscalationError(
        EscalationType.PROMO_CODE_INTENT_UNCLEAR,
        `Promo code intent "${intent.intent}" not handled`,
      );
  }
}

// =====================================================================================
// Scenario 1: Missed Promo Code Refund
// =====================================================================================

async function handleMissedPromoRefund(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
): Promise<PromoCodeResolutionResult> {
  const intent = context.state.intent!;
  const config = context.state.matchedConfig!;
  const inboundEmail = extractEmailAddress(context.email.fromEmail);
  const customerName = extractCustomerName(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.userId);

  // Step 5: Resolve the order. Try in this order:
  //   1. Order numbers the intent classifier already extracted from the email.
  //   2. Most recent order in WooCommerce that matches the inbound email.
  //   3. Run the shared AI order-number extractor as a second pass.
  // If none of the above produce an order id, the workflow proceeds to step 5.1 which
  // sends a follow-up email asking the customer for their order number and waits for
  // their reply (up to MAX_CUSTOMER_REPLY_WAIT_DAYS days).
  const orderResolution = await executeWorkflowAction(
    {
      type: PromoCodeActionType.EXTRACT_ORDER_NUMBER,
      step: 5,
      description: 'Resolve the order the refund applies to',
      actionDetails:
        'Resolving which order the missed promo code refund should apply to using AI extraction and a lookup of the most recent order matching the inbound email address.',
      metadata: {
        candidateOrderNumbers: intent.mentionedOrderNumbers,
      },
    },
    async () => {
      let orderId: string | null = intent.mentionedOrderNumbers[0] ?? null;

      if (!orderId) {
        const recent = await pcGetMostRecentOrderByEmail(context.userId, inboundEmail);
        if (recent?.id) orderId = String(recent.id);
      }

      if (!orderId) {
        const detection = await extractOrderNumberFromEmail(context.email);
        orderId = detection?.orderNumbers?.[0] ?? null;
      }

      if (orderId) {
        context.state.resolvedOrderId = orderId;
      }
      return { orderId };
    },
    context,
  );

  const orderFailure = buildPromoCodeFailureResult(context.state, orderResolution);
  if (orderFailure) return { ...orderFailure, responseSent: false, refundProcessed: false };

  // Step 5.1 (optional): if we still don't have an order id, ask the customer.
  // Per the agent spec, an inbound-email/order-email mismatch is NOT a refusal — we
  // just need an order to act on. We send a polite "what's your order number?" reply
  // and wait for the customer's response on this thread.
  if (!context.state.resolvedOrderId) {
    const followUpMessage = await generateOrderInfoRequestMessage(
      customerName,
      intent.customerQuery || 'promo code refund inquiry',
      aiIdentity,
    );

    const requestOrderInfoResult = await executeWorkflowAction(
      {
        type: PromoCodeActionType.REQUEST_ORDER_INFO,
        step: 5.1,
        description: 'Ask customer for their order number',
        actionDetails: `No order could be matched to ${inboundEmail} or extracted from the email body. Sending a follow-up message asking the customer to provide their order number, then waiting up to ${MAX_CUSTOMER_REPLY_WAIT_DAYS} days for their reply.`,
        proposedEmailBody: followUpMessage,
        metadata: { maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS },
      },
      async (humanResponse, runtimeControl) => {
        const messageToSend = humanResponse?.modifiedData?.message ?? followUpMessage;

        await sendCustomerNotificationViaThread(
          context.userId,
          inboundEmail,
          context.email.subject ?? '',
          messageToSend,
          context.email.threadId,
        );

        log.info('Asked customer for order number; parking workflow until reply arrives');
        context.state.awaitingCustomerReply = true;
        await runtimeControl?.setStatus(ActionStatus.AWAITING_CUSTOMER_REPLY);

        const maxWaitMs = MAX_CUSTOMER_REPLY_WAIT_DAYS * 24 * 60 * 60 * 1000;
        const replyReceived = await condition(() => !!context.state.customerReplyEmail, maxWaitMs);
        context.state.awaitingCustomerReply = false;

        if (replyReceived) {
          await runtimeControl?.setStatus(ActionStatus.EXECUTING);
        }

        if (replyReceived && context.state.customerReplyEmail) {
          const replyEmail = context.state.customerReplyEmail;
          try {
            await resolveOrderFromCustomerReply(context, replyEmail);
          } catch (error) {
            log.error('Failed to resolve order from customer reply', { error });
          } finally {
            context.state.customerReplyEmail = undefined;
          }
        }

        if (!replyReceived || !context.state.resolvedOrderId) {
          throw new EscalationError(
            EscalationType.ORDER_NOT_FOUND,
            replyReceived
              ? 'Customer replied but we still could not identify an order number'
              : `Customer did not reply within ${MAX_CUSTOMER_REPLY_WAIT_DAYS} days`,
            { customerReplied: replyReceived },
          );
        }

        return { orderId: context.state.resolvedOrderId };
      },
      context,
    );

    const requestOrderFailure = buildPromoCodeFailureResult(context.state, requestOrderInfoResult);
    if (requestOrderFailure)
      return { ...requestOrderFailure, responseSent: false, refundProcessed: false };
  }

  // The order is resolved by this point. Fetch it once so downstream steps (first-time
  // check, eligibility) can reference the order's billing email — the canonical
  // customer identity, which may differ from the inbound sender.
  const wooOrder = await getWooCommerceOrderById(context.userId, context.state.resolvedOrderId!);
  const lookupEmailForFirstTimeCheck =
    (wooOrder as any)?.billing?.email?.trim().toLowerCase() || inboundEmail;

  // Step 6: First-time-customer assessment. For first_time_customer_discount usage
  // type, we will not refund a returning customer because the promo only applied to
  // first-timers in the first place.
  //
  // IMPORTANT: We look up history by the ORDER'S billing email — not the inbound
  // sender. A customer who placed prior orders under a different email but is now
  // emailing from a new address still counts as returning, because identity is tied
  // to the order, not the sender.
  const configUsageTypes = Array.isArray(config.usageType)
    ? config.usageType
    : [config.usageTypeLegacy ?? 'first_time_customer_discount'];
  if (configUsageTypes.includes('first_time_customer_discount')) {
    const firstTimeResult = await executeWorkflowAction(
      {
        type: PromoCodeActionType.ASSESS_FIRST_TIME_CUSTOMER,
        step: 6,
        description: 'Verify the customer is a first-time buyer',
        actionDetails:
          "Checking past WooCommerce orders by the order's billing email (canonical customer identity) and, where available, by billing address to confirm the customer is eligible for the first-time-only promo code.",
      },
      async () => {
        const assessment = await pcAssessFirstTimeCustomer(
          context.userId,
          lookupEmailForFirstTimeCheck,
        );
        context.state.firstTimeAssessment = assessment;

        // We allow exactly one prior order: the order this refund is being requested for.
        const onlyMatchedOrderIsTarget =
          assessment.priorOrderCount === 1 &&
          context.state.resolvedOrderId &&
          assessment.priorOrderIds.includes(String(context.state.resolvedOrderId));

        if (!assessment.isFirstTime && !onlyMatchedOrderIsTarget) {
          throw new EscalationError(
            EscalationType.PROMO_CODE_REFUND_INELIGIBLE,
            `Customer has ${assessment.priorOrderCount} prior orders so the first-time-only promo code cannot be honored`,
            {
              promoCode: config.promoCode,
              priorOrderCount: assessment.priorOrderCount,
              priorOrderIds: assessment.priorOrderIds,
            },
          );
        }
        return assessment;
      },
      context,
    );

    const firstTimeFailure = buildPromoCodeFailureResult(context.state, firstTimeResult);
    if (firstTimeFailure)
      return { ...firstTimeFailure, responseSent: false, refundProcessed: false };
  }

  // Step 7: Eligibility + amount calculation, including the maxRefundAmount cap
  // (scenario 5 safety mechanism).
  const eligibilityResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.CHECK_REFUND_ELIGIBILITY,
      step: 7,
      description: `Check refund eligibility for order #${context.state.resolvedOrderId}`,
      actionDetails:
        'Computing the partial refund amount, applying the configured maximum refund cap, validating the order subtotal meets the minimum order value, and checking how much has already been refunded.',
      metadata: {
        promoCode: config.promoCode,
        orderId: context.state.resolvedOrderId,
        maxRefundAmount: config.maxRefundAmount,
      },
    },
    async () => {
      const eligibility = await pcCheckRefundEligibility(
        context.userId,
        context.state.resolvedOrderId!,
        config,
      );
      context.state.refundEligibility = eligibility;

      // Soft refusals do NOT throw here. The resolution sub-workflow detects them
      // after this action returns and answers the customer directly with a polite
      // policy reply instead of escalating. See SOFT_REFUSAL_KINDS for the current
      // set (subscription_excluded, already_refunded, product_not_eligible).
      if (!eligibility.eligible && !SOFT_REFUSAL_KINDS.has(eligibility.kind ?? 'other')) {
        // partial_refund_required is the agent's signal that an order has a mix of
        // eligible/ineligible items under the coupon's product restrictions. Use a
        // dedicated escalation type so the AI Team Center reviewer can recognize
        // the partial-refund scenario at a glance instead of digging through the
        // metadata blob.
        const escalationType =
          eligibility.kind === 'partial_refund_required'
            ? EscalationType.PROMO_CODE_PARTIAL_REFUND_REQUIRES_REVIEW
            : EscalationType.PROMO_CODE_REFUND_INELIGIBLE;
        throw new EscalationError(escalationType, eligibility.reason, { eligibility });
      }

      // Hard ceiling defense in depth (see PROMO_CODE_HARD_REFUND_CEILING). Only meaningful
      // when the refund is otherwise eligible — soft refusals never reach the cap because
      // they short-circuited above.
      if (
        eligibility.eligible &&
        parseFloat(eligibility.proposedRefundAmount) > PROMO_CODE_HARD_REFUND_CEILING
      ) {
        throw new EscalationError(
          EscalationType.PROMO_CODE_REFUND_INELIGIBLE,
          `Calculated refund of $${eligibility.proposedRefundAmount} exceeds the hard safety ceiling of $${PROMO_CODE_HARD_REFUND_CEILING}; manual review required`,
          { eligibility, ceiling: PROMO_CODE_HARD_REFUND_CEILING },
        );
      }
      return eligibility;
    },
    context,
  );

  const eligibilityFailure = buildPromoCodeFailureResult(context.state, eligibilityResult);
  if (eligibilityFailure)
    return { ...eligibilityFailure, responseSent: false, refundProcessed: false };

  const eligibility = context.state.refundEligibility!;

  // Soft refusal branch: send a polite, scenario-specific reply to the customer and
  // complete the workflow normally. Each soft-refusal kind needs a handler here AND
  // an entry in SOFT_REFUSAL_KINDS — the eligibility executor only suppresses the
  // EscalationError for kinds in that set.
  if (!eligibility.eligible) {
    if (eligibility.kind === 'subscription_excluded') {
      return await sendSubscriptionExcludedReply(context, config, eligibility);
    }
    if (eligibility.kind === 'already_refunded') {
      return await sendAlreadyRefundedReply(context, config, eligibility);
    }
    if (eligibility.kind === 'product_not_eligible') {
      return await sendProductNotEligibleReply(context, config, eligibility);
    }
    // Defensive: any soft kind without a handler falls back to escalation rather than
    // silently dropping the customer email.
    throw new EscalationError(
      EscalationType.PROMO_CODE_REFUND_INELIGIBLE,
      `No soft-refusal handler implemented for kind="${eligibility.kind}"; escalating to human review`,
      { eligibility },
    );
  }

  // Step 8: Generate the customer-facing message before issuing the refund so that
  // moderation, when enabled, lets the merchant approve the message + refund together.
  const message = await pcGenerateMissedRefundMessage({
    customerName,
    promoCode: config.promoCode,
    orderNumber: context.state.resolvedOrderId!,
    refundAmount: eligibility.proposedRefundAmount,
    cappedByMaxRefund: eligibility.cappedByMaxRefund,
    aiIdentity,
  });
  context.state.generatedResponse = message;

  // Step 8.1: Process the refund through WooCommerce REST.
  const refundResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.PROCESS_PROMO_CODE_REFUND,
      step: 8,
      description: `Refund $${eligibility.proposedRefundAmount} for order #${context.state.resolvedOrderId}`,
      actionDetails: `Issuing a $${eligibility.proposedRefundAmount} partial refund on WooCommerce order #${context.state.resolvedOrderId} to honor promo code ${config.promoCode}.`,
      proposedEmailBody: message,
      metadata: {
        orderId: context.state.resolvedOrderId,
        amount: eligibility.proposedRefundAmount,
        cappedByMaxRefund: eligibility.cappedByMaxRefund,
      },
    },
    async (humanResponse) => {
      const finalAmount =
        (humanResponse?.modifiedData?.refundAmount as string | undefined) ??
        eligibility.proposedRefundAmount;
      const refund = await pcProcessRefund(
        context.userId,
        context.state.resolvedOrderId!,
        finalAmount,
        config.promoCode,
      );
      context.state.refundResult = refund;
      return refund;
    },
    context,
  );

  const refundFailure = buildPromoCodeFailureResult(context.state, refundResult);
  if (refundFailure) return { ...refundFailure, responseSent: false, refundProcessed: false };

  // Step 9: Send the confirmation message to the customer.
  const sendResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.SEND_RESPONSE_MESSAGE,
      step: 9,
      description: 'Send refund confirmation to the customer',
      actionDetails: 'Sending the refund confirmation email to the customer thread.',
      proposedEmailBody: message,
    },
    async (humanResponse) => {
      const finalMessage = humanResponse?.modifiedData?.message ?? message;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        extractEmailAddress(context.email.fromEmail),
        context.email.subject ?? '',
        finalMessage,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );

  const sendFailure = buildPromoCodeFailureResult(context.state, sendResult);
  if (sendFailure) return { ...sendFailure, responseSent: false, refundProcessed: true };

  return { success: true, state: context.state, responseSent: true, refundProcessed: true };
}

/**
 * Soft-refusal handler: customer asked for a missed-promo refund on an order that turns
 * out to be a subscription order, but the matched promo's `appliesToSubscriptions=false`.
 * Instead of escalating to a human (the previous behavior), we generate a polite policy
 * reply explaining the code is for one-time orders only and complete the workflow normally.
 *
 * The reply still flows through `executeWorkflowAction` so it appears in the approval
 * queue / activity log like any other agent action — and, when moderation is enabled,
 * the merchant can review and edit the message before it sends.
 */
async function sendSubscriptionExcludedReply(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
  config: PromoCodeConfigurationEntity,
  eligibility: PromoCodeRefundEligibility,
): Promise<PromoCodeResolutionResult> {
  const customerName = extractCustomerName(context.email.fromEmail);
  const inboundEmail = extractEmailAddress(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.userId);

  const message = await pcGenerateSubscriptionExcludedMessage({
    customerName,
    promoCode: config.promoCode,
    orderNumber: context.state.resolvedOrderId!,
    aiIdentity,
  });
  context.state.generatedResponse = message;

  const sendResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.SEND_RESPONSE_MESSAGE,
      step: 8,
      description: `Notify customer that promo "${config.promoCode}" does not apply to subscription orders`,
      actionDetails: `Order #${context.state.resolvedOrderId} is a subscription order, but promo code "${config.promoCode}" is configured to apply only to one-time orders. Sending a polite policy explanation to the customer instead of escalating to a human.`,
      proposedEmailBody: message,
      metadata: {
        promoCode: config.promoCode,
        orderId: context.state.resolvedOrderId,
        ineligibilityKind: eligibility.kind,
        ineligibilityReason: eligibility.reason,
      },
    },
    async (humanResponse) => {
      const finalMessage = humanResponse?.modifiedData?.message ?? message;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        inboundEmail,
        context.email.subject ?? '',
        finalMessage,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );

  const sendFailure = buildPromoCodeFailureResult(context.state, sendResult);
  if (sendFailure) return { ...sendFailure, responseSent: false, refundProcessed: false };

  log.info('Subscription-excluded reply sent successfully', {
    promoCode: config.promoCode,
    orderId: context.state.resolvedOrderId,
  });

  return { success: true, state: context.state, responseSent: true, refundProcessed: false };
}

/**
 * Soft-refusal handler: customer asked us (often a second time) to apply a promo code
 * to an order that already has an agent-issued promo refund on it. Instead of
 * escalating, the agent confirms the prior refund and reminds them about typical
 * settlement times. The actual refund amount is taken from `alreadyRefundedAmount` on
 * the eligibility result, which sums every prior refund on the order — typically just
 * the one our agent issued.
 */
async function sendAlreadyRefundedReply(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
  config: PromoCodeConfigurationEntity,
  eligibility: PromoCodeRefundEligibility,
): Promise<PromoCodeResolutionResult> {
  const customerName = extractCustomerName(context.email.fromEmail);
  const inboundEmail = extractEmailAddress(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.userId);

  const message = await pcGenerateAlreadyRefundedMessage({
    customerName,
    promoCode: config.promoCode,
    orderNumber: context.state.resolvedOrderId!,
    alreadyRefundedAmount: eligibility.alreadyRefundedAmount,
    aiIdentity,
  });
  context.state.generatedResponse = message;

  const sendResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.SEND_RESPONSE_MESSAGE,
      step: 8,
      description: `Confirm prior promo "${config.promoCode}" refund on order #${context.state.resolvedOrderId}`,
      actionDetails: `Order #${context.state.resolvedOrderId} already has a promo code refund of $${eligibility.alreadyRefundedAmount}. Confirming the prior refund to the customer instead of escalating to a human or issuing a duplicate refund.`,
      proposedEmailBody: message,
      metadata: {
        promoCode: config.promoCode,
        orderId: context.state.resolvedOrderId,
        alreadyRefundedAmount: eligibility.alreadyRefundedAmount,
        ineligibilityKind: eligibility.kind,
        ineligibilityReason: eligibility.reason,
      },
    },
    async (humanResponse) => {
      const finalMessage = humanResponse?.modifiedData?.message ?? message;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        inboundEmail,
        context.email.subject ?? '',
        finalMessage,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );

  const sendFailure = buildPromoCodeFailureResult(context.state, sendResult);
  if (sendFailure) return { ...sendFailure, responseSent: false, refundProcessed: false };

  log.info('Already-refunded reply sent successfully', {
    promoCode: config.promoCode,
    orderId: context.state.resolvedOrderId,
    alreadyRefundedAmount: eligibility.alreadyRefundedAmount,
  });

  return { success: true, state: context.state, responseSent: true, refundProcessed: false };
}

/**
 * Soft-refusal handler: customer asked us to apply a promo code on an order whose
 * line items don't qualify under the coupon's WooCommerce product restrictions
 * (`product_ids` / `excluded_product_ids`). Instead of escalating, the agent sends
 * a polite reply naming what the customer ordered and explaining that the code
 * doesn't cover those items.
 *
 * Mixed orders (some items eligible, some not) are NOT handled here — those flow
 * through the regular escalation path with EscalationType.PROMO_CODE_PARTIAL_REFUND_REQUIRES_REVIEW
 * so a human can decide on a partial refund.
 */
async function sendProductNotEligibleReply(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
  config: PromoCodeConfigurationEntity,
  eligibility: PromoCodeRefundEligibility,
): Promise<PromoCodeResolutionResult> {
  const customerName = extractCustomerName(context.email.fromEmail);
  const inboundEmail = extractEmailAddress(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.userId);

  const ineligibleLineItems = eligibility.productRestriction?.ineligibleLineItems ?? [];

  const message = await pcGenerateProductNotEligibleMessage({
    customerName,
    promoCode: config.promoCode,
    orderNumber: context.state.resolvedOrderId!,
    ineligibleLineItems,
    aiIdentity,
  });
  context.state.generatedResponse = message;

  const sendResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.SEND_RESPONSE_MESSAGE,
      step: 8,
      description: `Notify customer that promo "${config.promoCode}" does not apply to items in order #${context.state.resolvedOrderId}`,
      actionDetails: `None of the items in order #${context.state.resolvedOrderId} qualify under promo code "${config.promoCode}"'s product restrictions. Sending a polite explanation to the customer instead of escalating to a human.`,
      proposedEmailBody: message,
      metadata: {
        promoCode: config.promoCode,
        orderId: context.state.resolvedOrderId,
        ineligibilityKind: eligibility.kind,
        ineligibilityReason: eligibility.reason,
        ineligibleLineItems: ineligibleLineItems.map((li) => ({
          name: li.name,
          productId: li.productId,
        })),
      },
    },
    async (humanResponse) => {
      const finalMessage = humanResponse?.modifiedData?.message ?? message;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        inboundEmail,
        context.email.subject ?? '',
        finalMessage,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );

  const sendFailure = buildPromoCodeFailureResult(context.state, sendResult);
  if (sendFailure) return { ...sendFailure, responseSent: false, refundProcessed: false };

  log.info('Product-not-eligible reply sent successfully', {
    promoCode: config.promoCode,
    orderId: context.state.resolvedOrderId,
    ineligibleItemCount: ineligibleLineItems.length,
  });

  return { success: true, state: context.state, responseSent: true, refundProcessed: false };
}

// =====================================================================================
// Scenario 2: First-time-only code denial for an existing customer
// =====================================================================================

async function handleFirstTimeDenied(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
): Promise<PromoCodeResolutionResult> {
  const intent = context.state.intent!;
  const customerName = extractCustomerName(context.email.fromEmail);
  const inboundEmail = extractEmailAddress(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.userId);

  const assessmentResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.ASSESS_FIRST_TIME_CUSTOMER,
      step: 5,
      description: 'Confirm the customer has prior orders',
      actionDetails:
        'Looking up WooCommerce orders for this customer (by email and billing address) to confirm they are not actually a first-time buyer before sending the denial explanation.',
    },
    async () => {
      const assessment = await pcAssessFirstTimeCustomer(context.userId, inboundEmail);
      context.state.firstTimeAssessment = assessment;
      return assessment;
    },
    context,
  );

  const assessmentFailure = buildPromoCodeFailureResult(context.state, assessmentResult);
  if (assessmentFailure)
    return { ...assessmentFailure, responseSent: false, refundProcessed: false };

  const message = await pcGenerateFirstTimeDeniedMessage({
    customerName,
    promoCode: intent.mentionedCode ?? context.state.matchedConfig?.promoCode ?? null,
    priorOrderCount: context.state.firstTimeAssessment?.priorOrderCount ?? 0,
    customDenialNote: context.state.agentSettings?.existingCustomerDenialNote ?? null,
    aiIdentity,
  });
  context.state.generatedResponse = message;

  const sendResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.SEND_RESPONSE_MESSAGE,
      step: 6,
      description: 'Send first-time-only explanation to the customer',
      actionDetails:
        'Sending the empathetic explanation that the promo code is reserved for first-time customers.',
      proposedEmailBody: message,
    },
    async (humanResponse) => {
      const finalMessage = humanResponse?.modifiedData?.message ?? message;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        inboundEmail,
        context.email.subject ?? '',
        finalMessage,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );

  const sendFailure = buildPromoCodeFailureResult(context.state, sendResult);
  if (sendFailure) return { ...sendFailure, responseSent: false, refundProcessed: false };

  return { success: true, state: context.state, responseSent: true, refundProcessed: false };
}

// =====================================================================================
// Scenario 3: Application Guidance ("Where do I enter the code?")
// =====================================================================================

async function handleApplicationGuidance(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
): Promise<PromoCodeResolutionResult> {
  const intent = context.state.intent!;
  const customerName = extractCustomerName(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.userId);

  // Step 5: Retrieve relevant chunks from the merchant's product knowledge.
  // Augment the customer's question with a hint phrase to bias the vector search
  // toward checkout/coupon-application content (their raw question is often very
  // short — e.g. "where do I put it?" — and embeds poorly on its own).
  const augmentedQuery = `Customer is asking how to apply a promo code or coupon at checkout. Their question: ${context.email.body}`;

  const retrievalResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.RETRIEVE_PRODUCT_KNOWLEDGE,
      step: 5,
      description: 'Look up checkout / promo application guidance in product knowledge',
      actionDetails:
        'Running a vector search against the merchant-authored product knowledge to find documented instructions on where/how to apply a promo code at checkout. The reply is grounded only in retrieved snippets; if no relevant content is found the workflow escalates instead of guessing.',
      metadata: {
        retrieval: PROMO_KNOWLEDGE_RETRIEVAL_DEFAULTS,
        minTopSimilarity: PROMO_KNOWLEDGE_MIN_TOP_SIMILARITY,
      },
    },
    async () => {
      const retrieval = await retrieveProductKnowledgeContext({
        userId: context.userId,
        query: augmentedQuery,
        ...PROMO_KNOWLEDGE_RETRIEVAL_DEFAULTS,
        enableQueryExpansion: true,
      });

      if (!retrieval.selectedChunks?.length) {
        throw new EscalationError(
          EscalationType.PROMO_CODE_APPLICATION_GUIDANCE_NOT_FOUND,
          'No product-knowledge content matched the customer\'s "how to apply" question; escalating so a human can answer and (ideally) add a doc covering this.',
          {
            totalMatches: retrieval.totalMatches,
            skippedBySimilarity: retrieval.skippedBySimilarity,
            skippedByTokenBudget: retrieval.skippedByTokenBudget,
            query: context.email.body,
          },
        );
      }

      const topSimilarity = Math.max(...retrieval.selectedChunks.map((chunk) => chunk.similarity));
      if (topSimilarity < PROMO_KNOWLEDGE_MIN_TOP_SIMILARITY) {
        throw new EscalationError(
          EscalationType.PROMO_CODE_APPLICATION_GUIDANCE_NOT_FOUND,
          `Product knowledge similarity too low (${topSimilarity.toFixed(3)} < ${PROMO_KNOWLEDGE_MIN_TOP_SIMILARITY}); escalating to avoid sending a confidently-wrong answer.`,
          {
            topSimilarity,
            threshold: PROMO_KNOWLEDGE_MIN_TOP_SIMILARITY,
            chunkCount: retrieval.selectedChunks.length,
            query: context.email.body,
          },
        );
      }

      return retrieval;
    },
    context,
  );

  const retrievalFailure = buildPromoCodeFailureResult(context.state, retrievalResult);
  if (retrievalFailure) return { ...retrievalFailure, responseSent: false, refundProcessed: false };

  const retrieval = retrievalResult.result!;

  // Step 6: Generate the customer reply grounded in the retrieved chunks.
  const message = await pcGenerateApplicationGuidanceFromKnowledge({
    customerName,
    customerQuery: context.email.body,
    promoCode: intent.mentionedCode ?? context.state.matchedConfig?.promoCode ?? null,
    knowledgeChunks: retrieval.selectedChunks.map((chunk) => ({
      sourceTitle: chunk.sourceTitle,
      sourceUrl: chunk.sourceUrl,
      content: chunk.content,
      similarity: chunk.similarity,
    })),
    aiIdentity,
  });
  context.state.generatedResponse = message;

  // Step 7: Send the reply.
  const sendResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.SEND_RESPONSE_MESSAGE,
      step: 6,
      description: 'Send promo code application guidance to the customer',
      actionDetails:
        "Sending the AI-generated answer (grounded in the merchant's product knowledge) telling the customer where to apply the promo code.",
      proposedEmailBody: message,
      metadata: {
        sourceChunkCount: retrieval.selectedChunks.length,
        topSimilarity: Math.max(...retrieval.selectedChunks.map((c) => c.similarity)),
      },
    },
    async (humanResponse) => {
      const finalMessage = humanResponse?.modifiedData?.message ?? message;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        extractEmailAddress(context.email.fromEmail),
        context.email.subject ?? '',
        finalMessage,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );

  const sendFailure = buildPromoCodeFailureResult(context.state, sendResult);
  if (sendFailure) return { ...sendFailure, responseSent: false, refundProcessed: false };

  return { success: true, state: context.state, responseSent: true, refundProcessed: false };
}

// =====================================================================================
// Scenario 4: General Inquiry / Discount Availability
// =====================================================================================

async function handleGeneralInquiry(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
): Promise<PromoCodeResolutionResult> {
  const customerName = extractCustomerName(context.email.fromEmail);
  const inboundEmail = extractEmailAddress(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.userId);

  // Get the customer's first-time status so we can offer (or withhold) a first-time
  // exclusive code rather than naively suggesting one that will fail at checkout.
  const assessment = await pcAssessFirstTimeCustomer(context.userId, inboundEmail);
  context.state.firstTimeAssessment = assessment;

  const activeConfigs = await pcGetActiveConfigurations(context.userId);

  const message = await pcGenerateGeneralInquiryMessage({
    customerName,
    isFirstTime: assessment.isFirstTime,
    activePromoCodes: activeConfigs.map((c) => ({
      code: c.promoCode,
      description: c.description,
      discountType: c.discountType,
      discountPercentage: c.discountPercentage,
      maxRefundAmount: c.maxRefundAmount,
      // Temporal serializes activity return values as JSON, so `Date` fields on
      // PromoCodeConfigurationEntity arrive at the workflow as ISO strings even
      // though the Drizzle type still claims `Date`. We coerce through `new Date(...)`
      // to handle both shapes safely (works on Date instances and on ISO strings).
      validUntil: c.validUntil ? new Date(c.validUntil as unknown as string).toISOString() : null,
      usageType: Array.isArray(c.usageType)
        ? c.usageType
        : [c.usageTypeLegacy ?? 'first_time_customer_discount'],
    })),
    aiIdentity,
  });
  context.state.generatedResponse = message;

  const sendResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.SEND_RESPONSE_MESSAGE,
      step: 5,
      description: 'Send promo code general inquiry response',
      actionDetails:
        'Sending a response to the customer with an eligible promo code (or politely letting them know none are available right now).',
      proposedEmailBody: message,
    },
    async (humanResponse) => {
      const finalMessage = humanResponse?.modifiedData?.message ?? message;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        inboundEmail,
        context.email.subject ?? '',
        finalMessage,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );

  const sendFailure = buildPromoCodeFailureResult(context.state, sendResult);
  if (sendFailure) return { ...sendFailure, responseSent: false, refundProcessed: false };

  return { success: true, state: context.state, responseSent: true, refundProcessed: false };
}
