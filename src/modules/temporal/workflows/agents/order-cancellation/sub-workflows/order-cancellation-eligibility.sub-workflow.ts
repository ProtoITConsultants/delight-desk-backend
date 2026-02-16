import { ActionExecutionContext, OrderCancellationActionType } from '../../../../types';
import { EligibilityCheckResult } from '../order-cancellation.types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { calculateHoursUntilDeadline, checkTimeEligibility } from '../order-cancellation.helpers';
import { log } from '@temporalio/workflow';

export async function handleOrderCancellationEligibility(
  context: ActionExecutionContext,
): Promise<EligibilityCheckResult> {
  let timeEligible = false;
  let emailValid = false;
  let eligibilityReason = '';
  let proceedWithCancellation = false;

  try {
    const { wooOrder } = context.state;

    if (!wooOrder) {
      throw new Error('WooCommerce order not available in state');
    }

    // ==========================================
    // ACTION 9: Check time-based eligibility
    // ==========================================

    const timeEligibilityResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.CHECK_TIME_ELIGIBILITY,
        step: 9,
        description: 'Check if order is within cancellation window',
      },
      async () => {
        const orderCreatedAt = wooOrder.date_created || wooOrder.date_created_gmt;

        if (!orderCreatedAt) {
          throw new Error('Order creation date not available');
        }

        const eligibility = checkTimeEligibility(orderCreatedAt);

        log.info('Eligibility: ', eligibility as any);

        timeEligible = eligibility.eligible;
        eligibilityReason = eligibility.reason;

        const hoursRemaining = calculateHoursUntilDeadline(orderCreatedAt);

        return {
          eligible: eligibility.eligible,
          reason: eligibility.reason,
          orderCreatedAt: eligibility.orderCreatedAt.toISOString(),
          currentTime: eligibility.currentTime.toISOString(),
          hoursSinceOrder: eligibility.hoursSinceOrder,
          hoursRemaining,
          extendedWindow: eligibility.extendedWindow,
        };
      },
      context,
    );

    if (!timeEligibilityResult.success) {
      if (timeEligibilityResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: timeEligibilityResult.escalation.type,
          reason: timeEligibilityResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          timeEligible,
          emailValid,
          eligibilityReason,
          proceedWithCancellation: false,
          escalation: timeEligibilityResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        timeEligible,
        emailValid,
        eligibilityReason,
        proceedWithCancellation: false,
      };
    }

    proceedWithCancellation = true;

    return {
      success: true,
      state: context.state,
      timeEligible,
      emailValid,
      eligibilityReason,
      proceedWithCancellation,
    };
  } catch (error) {
    throw error;
  }
}
