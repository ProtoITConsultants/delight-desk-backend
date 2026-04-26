import { ActionExecutionResult, EscalationDetails } from '../../../types';
import { PromoCodeWorkflowState } from '../promo-code.types';
import {
  PROMO_DISTRESS_ESCALATION_SCORE_THRESHOLD,
  PROMO_DISTRESS_FRUSTRATION_KEYWORDS,
  PROMO_DISTRESS_REPEAT_REQUEST_KEYWORDS,
  PROMO_DISTRESS_SIGNAL_WEIGHTS,
  PROMO_DISTRESS_URGENCY_KEYWORDS,
} from '../promo-code.constants';

interface PromoCodeActionFailureResult {
  success: false;
  state: PromoCodeWorkflowState;
  escalation?: EscalationDetails;
}

export interface PromoDistressAssessment {
  shouldEscalate: boolean;
  score: number;
  threshold: number;
  reasons: string[];
  matchedKeywords: {
    frustration: string[];
    urgency: string[];
    repeatRequest: string[];
  };
}

/**
 * Maps a failed workflow action result into the standardized promo failure shape used
 * by every promo sub-workflow. Mirrors order-cancellation's helper to keep the agent
 * code style consistent across the codebase.
 */
export function buildPromoCodeFailureResult(
  state: PromoCodeWorkflowState,
  actionResult: ActionExecutionResult,
): PromoCodeActionFailureResult | null {
  if (actionResult.success) return null;

  if (actionResult.escalation) {
    state.status = 'escalated';
    state.escalation = {
      type: actionResult.escalation.type,
      reason: actionResult.escalation.reason,
      timestamp: new Date(),
    };
    return { success: false, state, escalation: actionResult.escalation };
  }

  state.status = 'cancelled';
  return { success: false, state };
}

function findMatchedKeywords(text: string, keywords: readonly string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

/**
 * Scores customer distress for promo code emails. Refund denials and "I was charged
 * full price!" emails frequently arrive heated, so we score a bit more aggressively
 * on frustration keywords; the merchant can opt out by disabling moderation.
 */
export function assessPromoCodeDistress(
  emailBody: string | null | undefined,
  emailSubject: string | null | undefined,
  priority: 'low' | 'medium' | 'high' | 'urgent',
  sentiment: 'positive' | 'neutral' | 'negative',
): PromoDistressAssessment {
  const normalizedText = `${emailSubject ?? ''} ${emailBody ?? ''}`.toLowerCase();
  const matchedFrustration = findMatchedKeywords(normalizedText, PROMO_DISTRESS_FRUSTRATION_KEYWORDS);
  const matchedUrgency = findMatchedKeywords(normalizedText, PROMO_DISTRESS_URGENCY_KEYWORDS);
  const matchedRepeat = findMatchedKeywords(normalizedText, PROMO_DISTRESS_REPEAT_REQUEST_KEYWORDS);

  let score = 0;
  const reasons: string[] = [];

  if (priority === 'urgent') {
    score += PROMO_DISTRESS_SIGNAL_WEIGHTS.PRIORITY_URGENT;
    reasons.push('classification_priority_urgent');
  } else if (priority === 'high') {
    score += PROMO_DISTRESS_SIGNAL_WEIGHTS.PRIORITY_HIGH;
    reasons.push('classification_priority_high');
  }

  if (sentiment === 'negative') {
    score += PROMO_DISTRESS_SIGNAL_WEIGHTS.NEGATIVE_SENTIMENT;
    reasons.push('classification_sentiment_negative');
  }

  if (matchedFrustration.length > 0) {
    score += PROMO_DISTRESS_SIGNAL_WEIGHTS.FRUSTRATION_KEYWORD;
    reasons.push('frustration_language_detected');
  }
  if (matchedUrgency.length > 0) {
    score += PROMO_DISTRESS_SIGNAL_WEIGHTS.URGENCY_KEYWORD;
    reasons.push('urgency_language_detected');
  }
  if (matchedRepeat.length > 0) {
    score += PROMO_DISTRESS_SIGNAL_WEIGHTS.REPEAT_REQUEST_KEYWORD;
    reasons.push('repeat_request_language_detected');
  }

  return {
    shouldEscalate: score >= PROMO_DISTRESS_ESCALATION_SCORE_THRESHOLD,
    score,
    threshold: PROMO_DISTRESS_ESCALATION_SCORE_THRESHOLD,
    reasons,
    matchedKeywords: {
      frustration: matchedFrustration,
      urgency: matchedUrgency,
      repeatRequest: matchedRepeat,
    },
  };
}
