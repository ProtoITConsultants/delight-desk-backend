/**
 * Order Cancellation Order Processing Sub-Workflow
 * Handles Actions 4-8: Fetch order, validate status, duplicate checks, rate limit, record request
 */

import { log, proxyActivities } from '@temporalio/workflow';
import type { WismoOrderActivities } from '../../../../activities/agents/wismo/wismo-order.activities';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  OrderCancellationActionType,
} from '../../../../types';
import { OrderProcessingResult } from '../order-cancellation.types';
import { ACTIVITY_TIMEOUTS, RETRY_POLICIES } from '../order-cancellation.constants';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { formatOrderSummary, validateOrderStatus } from '../order-cancellation.helpers';

// Proxy activities
const wismoOrderActivities = proxyActivities<typeof WismoOrderActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.fetchOrder,
  retry: RETRY_POLICIES.standard,
});

const emailActivities = proxyActivities<typeof EmailActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.sendEmail,
  retry: RETRY_POLICIES.standard,
});

const { getWooCommerceOrderById } = wismoOrderActivities;
const { sendCustomerNotificationViaGmailThread } = emailActivities;

/**
 * Phase 3: Order Processing Sub-Workflow
 *
 * Actions:
 * 4. Fetch order from WooCommerce
 * 5. Validate order status
 * 6. Check for duplicate request
 * 7. Check rate limit
 * 8. Record cancellation request
 */
export async function handleOrderCancellationOrderProcessing(
  context: ActionExecutionContext,
): Promise<OrderProcessingResult> {
  let orderFetched = false;
  let orderStatusValid = false;

  try {
    const { orderNumber } = context.state;

    // ==========================================
    // ACTION 4: Fetch order from WooCommerce
    // ==========================================

    const fetchOrderResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.FETCH_ORDER_DETAILS,
        step: 4,
        description: `Fetch order ${orderNumber} from WooCommerce`,
      },
      async () => {
        const order = await getWooCommerceOrderById(context.userId, orderNumber as any);

        if (!order) {
          throw new EscalationError(
            EscalationType.ORDER_NOT_FOUND,
            `Order ${orderNumber} not found in WooCommerce`,
            { orderNumber },
          );
        }

        context.state.wooOrder = order;
        orderFetched = true;

        return {
          orderNumber:
            (order.number !== undefined ? order.number.toString() : undefined) ||
            order.orderId ||
            (order.id !== undefined ? order.id.toString() : undefined) ||
            orderNumber,
          status: order.status,
          trackingNumber: order.trackingNumber,
          summary: formatOrderSummary(order),
        };
      },
      context,
    );

    if (!fetchOrderResult.success) {
      if (fetchOrderResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: fetchOrderResult.escalation.type,
          reason: fetchOrderResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          orderFetched,
          orderStatusValid,
          escalation: fetchOrderResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        orderFetched,
        orderStatusValid,
      };
    }

    // ==========================================
    // ACTION 5: Validate order status
    // ==========================================

    const validateStatusResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.VALIDATE_ORDER_STATUS,
        step: 5,
        description: 'Validate order status for cancellation',
      },
      async () => {
        const order = context.state.wooOrder;
        const orderStatus = order?.status?.toLowerCase() || '';

        const validation = validateOrderStatus(orderStatus);

        if (!validation.valid) {
          await sendCustomerNotificationViaGmailThread(
            context.userId,
            context.email.fromEmail,
            `Order ${orderNumber} - ${orderStatus}`,
            `We received your cancellation request for order ${orderNumber}.

However, this order has a status of "${orderStatus}" and cannot be cancelled through our automated system.

${orderStatus === 'cancelled' ? 'The order has already been cancelled.' : ''}
${orderStatus === 'refunded' ? 'The order has already been refunded.' : ''}
${orderStatus === 'completed' || orderStatus === 'shipped' ? "The order has already been shipped or completed. If you need to return this order, please let us know and we'll provide return instructions." : ''}

Our team will review your request and follow up with you shortly.

Thank you for your patience.`,
            context.email.threadId,
          );

          throw new EscalationError(EscalationType.ORDER_NOT_ELIGIBLE, validation.reason, {
            orderNumber,
            orderStatus,
            customerNotified: true,
          });
        }

        orderStatusValid = true;

        return {
          orderStatus,
          valid: true,
          canProceed: validation.canProceed,
        };
      },
      context,
    );

    if (!validateStatusResult.success) {
      if (validateStatusResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: validateStatusResult.escalation.type,
          reason: validateStatusResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          orderFetched,
          orderStatusValid,
          escalation: validateStatusResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        orderFetched,
        orderStatusValid,
      };
    }

    // ==========================================
    // TODO: ACTION 6: Check for duplicate request
    // ==========================================

    // ==========================================
    // TODO: ACTION 7: Check rate limit
    // ==========================================

    // ==========================================
    // TODO: ACTION 8: Record cancellation request
    // ==========================================

    log.info('Order cancellation order processing phase completed', {
      orderNumber,
      orderFetched,
      orderStatusValid,
    });

    return {
      success: true,
      state: context.state,
      orderFetched,
      orderStatusValid,
    };
  } catch (error) {
    log.error('Order cancellation order processing phase failed', { error });
    throw error;
  }
}
