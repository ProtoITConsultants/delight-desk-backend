/**
 * Promo Code Intent Classification Sub-Workflow
 * Phase 2: Identify which of the four promo code scenarios this email belongs to and
 * resolve the matching configuration row.
 */

import { log, proxyActivities } from '@temporalio/workflow';
import type { PromoCodeActivities } from '../../../../activities/agents/promo-code/promo-code.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  PromoCodeActionType,
} from '../../../types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { ACTIVITY_TIMEOUTS, PROMO_CODE_INTENT_CONFIDENCE_THRESHOLD } from '../promo-code.constants';
import {
  PromoCodeIntentClassificationResult,
  PromoCodeWorkflowState,
} from '../promo-code.types';
import { buildPromoCodeFailureResult } from './promo-code-subworkflow.helpers';

const promoActivities = proxyActivities<typeof PromoCodeActivities.prototype>(
  ACTIVITY_TIMEOUTS.PROMO,
);
const { pcGetActiveConfigurations, pcGetAgentSettings, pcClassifyIntent, pcResolveConfigByCode } =
  promoActivities;

export async function handlePromoCodeIntentClassification(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
): Promise<PromoCodeIntentClassificationResult> {
  log.info('Starting Promo Code intent classification phase', {
    workflowId: context.workflowId,
    emailId: context.email.id,
  });

  // Pre-load the configurations so we can drop them into the classification prompt and
  // also have a list ready for the general inquiry branch.
  const settings = await pcGetAgentSettings(context.userId);
  context.state.agentSettings = settings;

  const configurations = await pcGetActiveConfigurations(context.userId);

  // Action: Sub-classify the customer's intent within the promo code domain.
  const classifyResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.CLASSIFY_PROMO_CODE_INTENT,
      step: 3,
      description: 'Classify which promo code scenario the email matches',
      actionDetails:
        'Running an AI sub-classifier to decide whether the customer wants a missed-promo refund, is hitting a first-time-only restriction, needs application guidance, or is making a general inquiry.',
      skipApproval: true,
      metadata: {
        configuredCodes: configurations.map((c) => c.promoCode),
        threshold: PROMO_CODE_INTENT_CONFIDENCE_THRESHOLD,
      },
    },
    async () => {
      const intent = await pcClassifyIntent(
        context.email,
        configurations.map((c) => c.promoCode),
      );

      if (intent.intent === 'unclear' || intent.confidence < PROMO_CODE_INTENT_CONFIDENCE_THRESHOLD) {
        throw new EscalationError(
          EscalationType.PROMO_CODE_INTENT_UNCLEAR,
          `Promo code intent ${intent.intent === 'unclear' ? 'is unclear' : `confidence (${intent.confidence}%) is below threshold (${PROMO_CODE_INTENT_CONFIDENCE_THRESHOLD}%)`}`,
          {
            intent: intent.intent,
            confidence: intent.confidence,
            reasoning: intent.reasoning,
          },
        );
      }

      context.state.intent = intent;
      return intent;
    },
    context,
  );

  const classifyFailure = buildPromoCodeFailureResult(context.state, classifyResult);
  if (classifyFailure) return classifyFailure;

  // Action: Resolve the configuration row referenced by the customer (if any). This
  // is required for missed_promo_refund and recommended for first_time_denied so the
  // generated reply mentions the actual code by name.
  const intent = context.state.intent!;
  const resolveResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.RESOLVE_PROMO_CODE_CONFIG,
      step: 4,
      description: intent.mentionedCode
        ? `Resolve configured promo code "${intent.mentionedCode}"`
        : 'Resolve configured promo code (none mentioned)',
      actionDetails:
        'Looking up the Delight Desk promo code configuration the customer referenced. For refund and denial intents we cannot proceed automatically without an active matching record.',
      skipApproval: true,
      metadata: {
        mentionedCode: intent.mentionedCode,
        intent: intent.intent,
      },
    },
    async () => {
      const matched = await pcResolveConfigByCode(context.userId, intent.mentionedCode);
      context.state.matchedConfig = matched ?? null;

      // For refund and denial intents, an active matching configuration is mandatory
      // because Delight Desk owns the eligibility rules. Application guidance and
      // general inquiries can proceed without a specific match.
      if (
        (intent.intent === 'missed_promo_refund' || intent.intent === 'first_time_denied') &&
        !matched
      ) {
        throw new EscalationError(
          EscalationType.PROMO_CODE_NOT_CONFIGURED,
          intent.mentionedCode
            ? `Customer referenced promo code "${intent.mentionedCode}" but no active configuration matches it`
            : 'Customer requested promo code action but no specific code was identified in the email',
          {
            mentionedCode: intent.mentionedCode,
            intent: intent.intent,
          },
        );
      }

      if (matched && !matched.isActive) {
        throw new EscalationError(
          EscalationType.PROMO_CODE_INACTIVE_OR_EXPIRED,
          `Promo code "${matched.promoCode}" is not active`,
          { promoCode: matched.promoCode },
        );
      }

      return { matchedConfigId: matched?.id ?? null };
    },
    context,
  );

  const resolveFailure = buildPromoCodeFailureResult(context.state, resolveResult);
  if (resolveFailure) return resolveFailure;

  log.info('Promo Code intent classification phase completed', {
    intent: intent.intent,
    confidence: intent.confidence,
    matchedConfigId: context.state.matchedConfig?.id ?? null,
  });

  return {
    success: true,
    state: context.state,
    intent: context.state.intent,
    matchedConfig: context.state.matchedConfig,
  };
}
