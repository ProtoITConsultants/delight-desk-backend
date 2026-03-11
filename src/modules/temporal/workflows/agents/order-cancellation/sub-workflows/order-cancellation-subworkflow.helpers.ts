import { ActionExecutionResult, EscalationDetails } from '../../../types';
import { OrderCancellationWorkflowState } from '../order-cancellation.types';
import {
  CUSTOMER_DISTRESS_ESCALATION_SCORE_THRESHOLD,
  CUSTOMER_DISTRESS_FRUSTRATION_KEYWORDS,
  CUSTOMER_DISTRESS_REPEAT_REQUEST_KEYWORDS,
  CUSTOMER_DISTRESS_SIGNAL_WEIGHTS,
  CUSTOMER_DISTRESS_URGENCY_KEYWORDS,
} from '../order-cancellation.constants';

interface OrderCancellationActionFailureResult {
  success: false;
  state: OrderCancellationWorkflowState;
  escalation?: EscalationDetails;
}

export interface CustomerDistressAssessment {
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
 * Maps a failed workflow action result to the shared order-cancellation failure shape.
 * Preserves existing escalation/cancellation behavior for sub-workflows.
 */
export function buildOrderCancellationFailureResult(
  state: OrderCancellationWorkflowState,
  actionResult: ActionExecutionResult,
): OrderCancellationActionFailureResult | null {
  if (actionResult.success) {
    return null;
  }

  if (actionResult.escalation) {
    state.status = 'escalated';
    state.escalation = {
      type: actionResult.escalation.type,
      reason: actionResult.escalation.reason,
      timestamp: new Date(),
    };

    return {
      success: false,
      state,
      escalation: actionResult.escalation,
    };
  }

  state.status = 'cancelled';
  return {
    success: false,
    state,
  };
}

function findMatchedKeywords(text: string, keywords: readonly string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword));
}

/**
 * Scores customer distress using classification + message text.
 * Returns deterministic signals for escalation decisions in workflow code.
 */
export function assessCustomerDistress(
  emailBody: string | null | undefined,
  emailSubject: string | null | undefined,
  priority: 'low' | 'medium' | 'high' | 'urgent',
  sentiment: 'positive' | 'neutral' | 'negative',
): CustomerDistressAssessment {
  const normalizedText = `${emailSubject ?? ''} ${emailBody ?? ''}`.toLowerCase();
  const matchedFrustrationKeywords = findMatchedKeywords(
    normalizedText,
    CUSTOMER_DISTRESS_FRUSTRATION_KEYWORDS,
  );
  const matchedUrgencyKeywords = findMatchedKeywords(normalizedText, CUSTOMER_DISTRESS_URGENCY_KEYWORDS);
  const matchedRepeatRequestKeywords = findMatchedKeywords(
    normalizedText,
    CUSTOMER_DISTRESS_REPEAT_REQUEST_KEYWORDS,
  );

  let score = 0;
  const reasons: string[] = [];

  if (priority === 'urgent') {
    score += CUSTOMER_DISTRESS_SIGNAL_WEIGHTS.PRIORITY_URGENT;
    reasons.push('classification_priority_urgent');
  } else if (priority === 'high') {
    score += CUSTOMER_DISTRESS_SIGNAL_WEIGHTS.PRIORITY_HIGH;
    reasons.push('classification_priority_high');
  }

  if (sentiment === 'negative') {
    score += CUSTOMER_DISTRESS_SIGNAL_WEIGHTS.NEGATIVE_SENTIMENT;
    reasons.push('classification_sentiment_negative');
  }

  if (matchedFrustrationKeywords.length > 0) {
    score += CUSTOMER_DISTRESS_SIGNAL_WEIGHTS.FRUSTRATION_KEYWORD;
    reasons.push('frustration_language_detected');
  }

  if (matchedUrgencyKeywords.length > 0) {
    score += CUSTOMER_DISTRESS_SIGNAL_WEIGHTS.URGENCY_KEYWORD;
    reasons.push('urgency_language_detected');
  }

  if (matchedRepeatRequestKeywords.length > 0) {
    score += CUSTOMER_DISTRESS_SIGNAL_WEIGHTS.REPEAT_REQUEST_KEYWORD;
    reasons.push('repeat_request_language_detected');
  }

  return {
    shouldEscalate: score >= CUSTOMER_DISTRESS_ESCALATION_SCORE_THRESHOLD,
    score,
    threshold: CUSTOMER_DISTRESS_ESCALATION_SCORE_THRESHOLD,
    reasons,
    matchedKeywords: {
      frustration: matchedFrustrationKeywords,
      urgency: matchedUrgencyKeywords,
      repeatRequest: matchedRepeatRequestKeywords,
    },
  };
}
