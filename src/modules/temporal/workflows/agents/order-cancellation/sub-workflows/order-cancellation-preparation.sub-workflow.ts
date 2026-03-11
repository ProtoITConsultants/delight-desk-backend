/**
 * Order Cancellation Preparation Sub-Workflow
 * Handles Actions 1-2.1: Mark email as read, verify AI confidence, and assess distress
 */

import { log, proxyActivities } from '@temporalio/workflow';

import type { EmailActivities } from '../../../../activities/shared/email.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  OrderCancellationActionType,
} from '../../../types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import {
  OrderCancellationWorkflowState,
  PreparationResult,
} from '../order-cancellation.types';
import { ACTIVITY_TIMEOUTS, CLASSIFICATION_CONFIDENCE_THRESHOLD } from '../order-cancellation.constants';
import {
  assessCustomerDistress,
  buildOrderCancellationFailureResult,
} from './order-cancellation-subworkflow.helpers';

// Proxy email activities
const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);

const { markEmailAsRead } = emailActivities;

/**
 * Handle preparation phase: mark email as read and verify AI confidence
 */
export async function handleOrderCancellationPreparation(
  context: ActionExecutionContext<OrderCancellationWorkflowState>,
): Promise<PreparationResult> {
  log.info('Starting Order Cancellation preparation phase', {
    workflowId: context.workflowId,
    emailId: context.email.id,
  });

  let emailMarkedAsRead = false;
  let confidenceVerified = false;
  let distressAssessed = false;

  try {
    // ==========================================
    // ACTION 1: Mark Incoming Email As Read
    // ==========================================
    const markReadResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.MARK_EMAIL_READ,
        step: 1,
        description: 'Mark incoming email as read',
        actionDetails: `Marking the incoming email from ${context.email.fromEmail} as read to acknowledge receipt.`,
      },
      () => markEmailAsRead(context.email.userId, context.email.messageId),
      context,
    );

    const markReadFailure = buildOrderCancellationFailureResult(context.state, markReadResult);
    if (markReadFailure) {
      return {
        ...markReadFailure,
        emailMarkedAsRead: false,
        confidenceVerified: false,
      };
    }

    emailMarkedAsRead = true;

    // ==========================================
    // ACTION 2: Verify AI Confidence
    // ==========================================
    const confidenceCheckResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.VERIFY_AI_CONFIDENCE,
        step: 2,
        description: `Verify AI classification confidence (${context.state.classification.confidence}%)`,
        actionDetails: 'Verifying AI classification confidence is sufficient to proceed automatically.',
        metadata: {
          confidence: context.state.classification.confidence,
          category: context.state.classification.category,
          threshold: CLASSIFICATION_CONFIDENCE_THRESHOLD,
        },
      },
      async () => {
        if (context.state.classification.category !== 'order_cancellation') {
          throw new EscalationError(
            EscalationType.MANUAL_ESCALATION,
            `Order Cancellation workflow received incompatible classification category: ${context.state.classification.category}`,
            {
              category: context.state.classification.category,
              expected: ['order_cancellation'],
            },
          );
        }

        if (context.state.classification.confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
          throw new EscalationError(
            EscalationType.LOW_CLASSIFICATION_CONFIDENCE,
            `Classification confidence (${context.state.classification.confidence}%) below threshold (${CLASSIFICATION_CONFIDENCE_THRESHOLD}%)`,
            {
              confidence: `${context.state.classification.confidence}%`,
              category: context.state.classification.category,
              threshold: CLASSIFICATION_CONFIDENCE_THRESHOLD,
            },
          );
        }
        return { verified: true, confidence: context.state.classification.confidence };
      },
      context,
    );

    const confidenceFailure = buildOrderCancellationFailureResult(context.state, confidenceCheckResult);
    if (confidenceFailure) {
      return {
        ...confidenceFailure,
        emailMarkedAsRead: true,
        confidenceVerified: false,
      };
    }

    confidenceVerified = true;

    // ==========================================
    // ACTION 2.1: Detect Customer Distress Signals
    // ==========================================
    const distressCheckResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.DETECT_CUSTOMER_DISTRESS,
        step: 2.1,
        description: 'Detect urgency and frustration signals for auto-escalation',
        actionDetails:
          'Scoring customer distress using email language, classifier priority, and sentiment to decide whether immediate human escalation is required.',
      },
      async () => {
        if (context.state.classification.scenarios?.escalation) {
          throw new EscalationError(
            EscalationType.CUSTOMER_DISTRESS_URGENT,
            'Classifier marked this email as escalation scenario',
            {
              scenarios: context.state.classification.scenarios,
              classification: {
                category: context.state.classification.category,
                priority: context.state.classification.priority,
                sentiment: context.state.classification.sentiment,
              },
            },
          );
        }

        const distressAssessment = assessCustomerDistress(
          context.email.body,
          context.email.subject,
          context.state.classification.priority,
          context.state.classification.sentiment,
        );

        if (distressAssessment.shouldEscalate) {
          throw new EscalationError(
            EscalationType.CUSTOMER_DISTRESS_URGENT,
            `Customer distress detected (score ${distressAssessment.score}/${distressAssessment.threshold})`,
            {
              score: distressAssessment.score,
              threshold: distressAssessment.threshold,
              reasons: distressAssessment.reasons,
              matchedKeywords: distressAssessment.matchedKeywords,
              classification: {
                priority: context.state.classification.priority,
                sentiment: context.state.classification.sentiment,
              },
            },
          );
        }

        return distressAssessment;
      },
      context,
    );

    const distressFailure = buildOrderCancellationFailureResult(context.state, distressCheckResult);
    if (distressFailure) {
      return {
        ...distressFailure,
        emailMarkedAsRead: true,
        confidenceVerified: true,
      };
    }

    distressAssessed = true;

    log.info('Order Cancellation preparation phase completed successfully', {
      emailMarkedAsRead,
      confidenceVerified,
      distressAssessed,
    });

    return {
      success: true,
      state: context.state,
      emailMarkedAsRead,
      confidenceVerified,
    };
  } catch (error) {
    log.error('Order Cancellation preparation phase failed', { error });
    throw error;
  }
}
