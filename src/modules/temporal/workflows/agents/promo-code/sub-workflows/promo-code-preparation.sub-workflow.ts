/**
 * Promo Code Preparation Sub-Workflow
 * Phase 1: Mark email as read, verify AI classification confidence, detect distress.
 */

import { log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  PromoCodeActionType,
} from '../../../types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import {
  ACTIVITY_TIMEOUTS,
  PROMO_CODE_CLASSIFICATION_CONFIDENCE_THRESHOLD,
} from '../promo-code.constants';
import { PromoCodePreparationResult, PromoCodeWorkflowState } from '../promo-code.types';
import { assessPromoCodeDistress, buildPromoCodeFailureResult } from './promo-code-subworkflow.helpers';

const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const { markEmailAsRead } = emailActivities;

export async function handlePromoCodePreparation(
  context: ActionExecutionContext<PromoCodeWorkflowState>,
): Promise<PromoCodePreparationResult> {
  log.info('Starting Promo Code preparation phase', {
    workflowId: context.workflowId,
    emailId: context.email.id,
  });

  let emailMarkedAsRead = false;
  let confidenceVerified = false;

  // Action 1: Mark email as read.
  const markReadResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.MARK_EMAIL_READ,
      step: 1,
      name: 'Mark incoming email as read',
      actionDetails: `Marking the incoming promo code email from ${context.email.fromEmail} as read.`,
    },
    () => markEmailAsRead(context.email.userId, context.email.messageId),
    context,
  );
  const markReadFailure = buildPromoCodeFailureResult(context.state, markReadResult);
  if (markReadFailure) {
    return { ...markReadFailure, emailMarkedAsRead: false, confidenceVerified: false };
  }
  emailMarkedAsRead = true;

  // Action 2: Verify the top-level email classification is actually promo_code with
  // sufficient confidence so we never run refund logic on a misrouted message.
  const confidenceResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.VERIFY_AI_CONFIDENCE,
      step: 2,
      name: `Verify AI classification confidence (${context.state.classification.confidence}%)`,
      actionDetails:
        'Verifying the top-level email classifier flagged this as a promo_code email with sufficient confidence.',
      skipApproval: true,
      metadata: {
        confidence: context.state.classification.confidence,
        category: context.state.classification.category,
        threshold: PROMO_CODE_CLASSIFICATION_CONFIDENCE_THRESHOLD,
      },
    },
    async () => {
      if (context.state.classification.category !== 'promo_code') {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          `Promo Code workflow received incompatible classification category: ${context.state.classification.category}`,
          {
            category: context.state.classification.category,
            expected: ['promo_code'],
          },
        );
      }
      if (context.state.classification.confidence < PROMO_CODE_CLASSIFICATION_CONFIDENCE_THRESHOLD) {
        throw new EscalationError(
          EscalationType.LOW_CLASSIFICATION_CONFIDENCE,
          `Classification confidence (${context.state.classification.confidence}%) below threshold (${PROMO_CODE_CLASSIFICATION_CONFIDENCE_THRESHOLD}%)`,
          {
            confidence: `${context.state.classification.confidence}%`,
            threshold: PROMO_CODE_CLASSIFICATION_CONFIDENCE_THRESHOLD,
          },
        );
      }
      return { verified: true };
    },
    context,
  );
  const confidenceFailure = buildPromoCodeFailureResult(context.state, confidenceResult);
  if (confidenceFailure) {
    return { ...confidenceFailure, emailMarkedAsRead: true, confidenceVerified: false };
  }
  confidenceVerified = true;

  // Action 2.1: Distress / escalation detection. Promo code refund denials and "I was
  // charged full price" emails frequently arrive heated.
  const distressResult = await executeWorkflowAction(
    {
      type: PromoCodeActionType.DETECT_CUSTOMER_DISTRESS,
      step: 2.1,
      name: 'Detect urgency and frustration signals for auto-escalation',
      actionDetails:
        'Scoring customer distress to decide whether to escalate the promo code inquiry to a human agent before any automated handling.',
      skipApproval: true,
    },
    async () => {
      if (context.state.classification.scenarios?.escalation) {
        throw new EscalationError(
          EscalationType.CUSTOMER_DISTRESS_URGENT,
          'Classifier marked this email as escalation scenario',
          {
            scenarios: context.state.classification.scenarios,
          },
        );
      }
      const assessment = assessPromoCodeDistress(
        context.email.body,
        context.email.subject,
        context.state.classification.priority,
        context.state.classification.sentiment,
      );
      if (assessment.shouldEscalate) {
        throw new EscalationError(
          EscalationType.CUSTOMER_DISTRESS_URGENT,
          `Customer distress detected (score ${assessment.score}/${assessment.threshold})`,
          {
            score: assessment.score,
            threshold: assessment.threshold,
            reasons: assessment.reasons,
            matchedKeywords: assessment.matchedKeywords,
          },
        );
      }
      return assessment;
    },
    context,
  );
  const distressFailure = buildPromoCodeFailureResult(context.state, distressResult);
  if (distressFailure) {
    return { ...distressFailure, emailMarkedAsRead: true, confidenceVerified: true };
  }

  log.info('Promo Code preparation phase completed', { emailMarkedAsRead, confidenceVerified });

  return {
    success: true,
    state: context.state,
    emailMarkedAsRead,
    confidenceVerified,
  };
}
