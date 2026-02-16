import { log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  OrderCancellationActionType,
} from '../../../../types';
import { PreparationResult } from '../order-cancellation.types';
import {
  ACTIVITY_TIMEOUTS,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  RETRY_POLICIES,
} from '../order-cancellation.constants';
import { executeWorkflowAction } from '../../../workflow-action.helpers';

// Proxy email activities
const emailActivities = proxyActivities<typeof EmailActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.markEmailAsRead,
  retry: RETRY_POLICIES.standard,
});

const { markEmailAsRead } = emailActivities;

/**
 * Phase 1: Preparation Sub-Workflow
 *
 * Actions:
 * 1. Mark email as read
 * 2. Verify AI confidence
 *
 * This phase ensures the email is properly tracked and that
 * the AI classification is confident enough to proceed automatically.
 */
export async function handleOrderCancellationPreparation(
  context: ActionExecutionContext,
): Promise<PreparationResult> {
  log.info('Starting Order Cancellation preparation phase', {
    workflowId: context.workflowId,
    emailId: context.email.id,
  });

  let emailMarkedAsRead = false;
  let confidenceVerified = false;

  try {
    // ==========================================
    // ACTION 1: Mark Incoming Email As Read
    // ==========================================

    const markReadResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.MARK_EMAIL_READ,
        step: 1,
        description: 'Mark incoming email as read',
      },
      () => markEmailAsRead(context.email.userId, context.email.messageId),
      context,
    );

    if (!markReadResult.success) {
      if (markReadResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: markReadResult.escalation.type,
          reason: markReadResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          emailMarkedAsRead: false,
          confidenceVerified: false,
          escalation: markReadResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        emailMarkedAsRead: false,
        confidenceVerified: false,
      };
    }

    emailMarkedAsRead = true;

    // Action 2: Verify AI confidence
    const confidenceCheckResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.VERIFY_AI_CONFIDENCE,
        step: 2,
        description: `Verify AI classification confidence (${context.state.classification.confidence}%)`,
        metadata: {
          confidence: context.state.classification.confidence,
          category: context.state.classification.category,
          threshold: CLASSIFICATION_CONFIDENCE_THRESHOLD,
        },
      },
      async () => {
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

    if (!confidenceCheckResult.success) {
      if (confidenceCheckResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: confidenceCheckResult.escalation.type,
          reason: confidenceCheckResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          emailMarkedAsRead: true,
          confidenceVerified: false,
          escalation: confidenceCheckResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        emailMarkedAsRead: true,
        confidenceVerified: false,
      };
    }

    confidenceVerified = true;

    log.info('Order Cancellation preparation phase completed successfully', {
      emailMarkedAsRead,
      confidenceVerified,
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
