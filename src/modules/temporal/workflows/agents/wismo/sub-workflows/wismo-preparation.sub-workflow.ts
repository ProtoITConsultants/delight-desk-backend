/**
 * WISMO Preparation Sub-Workflow
 * Handles Actions 1-2: Mark email as read and verify AI confidence
 */

import { log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  WismoActionType,
} from '../../../../types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { PreparationResult } from '../wismo.types';
import { ACTIVITY_TIMEOUTS, CLASSIFICATION_CONFIDENCE_THRESHOLD } from '../wismo.constants';

// Proxy email activities
const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);

const { markEmailAsRead } = emailActivities;

/**
 * Handle preparation phase: mark email as read and verify AI confidence
 */
export async function handleWismoPreparation(
  context: ActionExecutionContext,
): Promise<PreparationResult> {
  log.info('Starting WISMO preparation phase', {
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
        type: WismoActionType.MARK_EMAIL_READ,
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

    // ==========================================
    // ACTION 2: Verify AI Confidence
    // ==========================================

    const confidenceCheckResult = await executeWorkflowAction(
      {
        type: WismoActionType.VERIFY_AI_CONFIDENCE,
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

    log.info('WISMO preparation phase completed successfully', {
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
    log.error('WISMO preparation phase failed', { error });
    throw error;
  }
}
