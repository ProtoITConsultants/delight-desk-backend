import { log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import {
  ActionExecutionContext,
  AddressChangeActionType,
  EscalationError,
  EscalationType,
} from '../../../types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import {
  ACTIVITY_TIMEOUTS,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
} from '../address-change.constants';
import { AddressChangeWorkflowState, PreparationResult } from '../address-change.types';
import {
  assessCustomerDistress,
  buildAddressChangeFailureResult,
} from './address-change-subworkflow.helpers';

const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const { markEmailAsRead } = emailActivities;

export async function handleAddressChangePreparation(
  context: ActionExecutionContext<AddressChangeWorkflowState>,
): Promise<PreparationResult> {
  log.info('Starting Address Change preparation phase', {
    workflowId: context.workflowId,
    emailId: context.email.id,
  });

  let emailMarkedAsRead = false;
  let confidenceVerified = false;

  const markReadResult = await executeWorkflowAction(
    {
      type: AddressChangeActionType.MARK_EMAIL_READ,
      step: 1,
      description: 'Mark incoming email as read',
      actionDetails: `Marking the incoming email from ${context.email.fromEmail} as read to acknowledge receipt.`,
    },
    () => markEmailAsRead(context.email.userId, context.email.messageId),
    context,
  );

  const markReadFailure = buildAddressChangeFailureResult(context.state, markReadResult);
  if (markReadFailure) {
    return {
      ...markReadFailure,
      emailMarkedAsRead: false,
      confidenceVerified: false,
    };
  }

  emailMarkedAsRead = true;

  const confidenceCheckResult = await executeWorkflowAction(
    {
      type: AddressChangeActionType.VERIFY_AI_CONFIDENCE,
      step: 2,
      description: `Verify AI classification confidence (${context.state.classification.confidence}%)`,
      actionDetails:
        'Verifying AI classification confidence is sufficient to proceed automatically.',
      metadata: {
        confidence: context.state.classification.confidence,
        category: context.state.classification.category,
        threshold: CLASSIFICATION_CONFIDENCE_THRESHOLD,
      },
    },
    async () => {
      if (context.state.classification.category !== 'address_change') {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          `Address Change workflow received incompatible classification category: ${context.state.classification.category}`,
          {
            category: context.state.classification.category,
            expected: ['address_change'],
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

      return { verified: true };
    },
    context,
  );

  const confidenceFailure = buildAddressChangeFailureResult(context.state, confidenceCheckResult);
  if (confidenceFailure) {
    return {
      ...confidenceFailure,
      emailMarkedAsRead: true,
      confidenceVerified: false,
    };
  }

  confidenceVerified = true;

  const distressCheckResult = await executeWorkflowAction(
    {
      type: AddressChangeActionType.DETECT_CUSTOMER_DISTRESS,
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
          },
        );
      }

      return distressAssessment;
    },
    context,
  );

  const distressFailure = buildAddressChangeFailureResult(context.state, distressCheckResult);
  if (distressFailure) {
    return {
      ...distressFailure,
      emailMarkedAsRead: true,
      confidenceVerified: true,
    };
  }

  return {
    success: true,
    state: context.state,
    emailMarkedAsRead,
    confidenceVerified,
  };
}
