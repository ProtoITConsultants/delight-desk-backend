import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  OrderCancellationActionType,
} from '../../../../types';
import { EligibilityCheckResult } from '../order-cancellation.types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { calculateHoursUntilDeadline, checkTimeEligibility } from '../order-cancellation.helpers';

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
        actionDetails: `Checking if order #${context.state.orderNumber} was placed within the cancellation eligibility window. Standard window: 24 hours from order creation. Extended window: Friday orders after 12 PM UTC get until Monday 12 PM UTC. Weekend orders get until Monday 12 PM UTC. Input: Order creation date (${wooOrder.date_created || wooOrder.date_created_gmt}), current time. Output: Eligible (continue to fulfillment) or not eligible (escalate).`,
      },
      async () => {
        const orderCreatedAt = wooOrder.date_created || wooOrder.date_created_gmt;

        if (!orderCreatedAt) {
          throw new Error('Order creation date not available');
        }

        const eligibility = checkTimeEligibility(orderCreatedAt);

        timeEligible = eligibility.eligible;
        eligibilityReason = eligibility.reason;

        const hoursRemaining = calculateHoursUntilDeadline(orderCreatedAt);

        const result = {
          eligible: eligibility.eligible,
          reason: eligibility.reason,
          orderCreatedAt: eligibility.orderCreatedAt.toISOString(),
          currentTime: eligibility.currentTime.toISOString(),
          hoursSinceOrder: eligibility.hoursSinceOrder,
          hoursRemaining,
          extendedWindow: eligibility.extendedWindow,
        };

        if (!eligibility.eligible) {
          throw new EscalationError(EscalationType.ORDER_NOT_ELIGIBLE, eligibility.reason, result);
        }

        return result;
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
