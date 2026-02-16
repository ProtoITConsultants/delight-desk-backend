import { proxyActivities, sleep } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { OrderCancellationWooCommerceActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-woocommerce.activities';
import type { OrderCancellationShipBobActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-shipbob.activities';
import type { OrderCancellationShipStationActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-shipstation.activities';
import {
  ActionExecutionContext,
  ActionExecutionResult,
  EscalationError,
  EscalationType,
  OrderCancellationActionType,
} from '../../../../types';
import {
  FulfillmentProcessingResult,
  OrderCancellationSettings,
} from '../order-cancellation.types';
import {
  ACTIVITY_TIMEOUTS,
  FulfillmentMethod,
  MESSAGE_PREFIXES,
  RETRY_POLICIES,
  WAREHOUSE_REPLY_CHECK_INTERVAL,
  WAREHOUSE_REPLY_TIMEOUT_HOURS,
} from '../order-cancellation.constants';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { parseWarehouseReply } from '../order-cancellation.helpers';

// Proxy activities
const emailActivities = proxyActivities<typeof EmailActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.sendEmail,
  retry: RETRY_POLICIES.standard,
});

const wooCommerceActivities = proxyActivities<
  typeof OrderCancellationWooCommerceActivities.prototype
>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.cancelOrder,
  retry: RETRY_POLICIES.extended,
});

const shipBobActivities = proxyActivities<typeof OrderCancellationShipBobActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.cancelShipBob,
  retry: RETRY_POLICIES.extended,
});

const shipStationActivities = proxyActivities<
  typeof OrderCancellationShipStationActivities.prototype
>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.cancelShipStation,
  retry: RETRY_POLICIES.extended,
});

const { sendCustomerNotificationViaGmailThread, checkForCustomerReplyInThread } = emailActivities;
const { cancelAndRefundWooCommerceOrder } = wooCommerceActivities;
const { getShipBobOrderByReference, checkShipBobCancellationEligibility, cancelShipBobOrder } =
  shipBobActivities;
const {
  getShipStationOrderByNumber,
  checkShipStationCancellationEligibility,
  cancelShipStationOrder,
} = shipStationActivities;

function buildFailureResult(
  context: ActionExecutionContext,
  result: ActionExecutionResult,
  fulfillmentMethod: FulfillmentMethod,
  flags: {
    cancellationProcessed: boolean;
    refundProcessed: boolean;
    warehouseNotified?: boolean;
    warehouseResponded?: boolean;
    apiCancellationSuccess?: boolean;
  },
): FulfillmentProcessingResult | null {
  if (result.success) return null;

  if (result.escalation) {
    context.state.status = 'escalated';
    context.state.escalation = {
      type: result.escalation.type,
      reason: result.escalation.reason,
      timestamp: new Date(),
    };
  } else {
    context.state.status = 'cancelled';
  }

  return {
    success: false,
    state: context.state,
    escalation: result.escalation,
    fulfillmentMethod,
    cancellationProcessed: flags.cancellationProcessed,
    refundProcessed: flags.refundProcessed,
    warehouseNotified: flags.warehouseNotified,
    warehouseResponded: flags.warehouseResponded,
    apiCancellationSuccess: flags.apiCancellationSuccess,
  };
}

/**
 * Phase 5: Fulfillment Processing Sub-Workflow
 */
export async function handleOrderCancellationFulfillment(
  context: ActionExecutionContext,
  agentSettings: OrderCancellationSettings,
): Promise<FulfillmentProcessingResult> {
  const fulfillmentMethod = agentSettings.fulfillmentMethod;
  let cancellationProcessed = false;
  let refundProcessed = false;
  let warehouseNotified = false;
  let warehouseResponded = false;
  let apiCancellationSuccess = false;

  try {
    const { orderNumber, wooOrder, cancellationRequestId } = context.state;

    if (!orderNumber || !wooOrder) {
      throw new Error('Order information not available in state');
    }

    switch (fulfillmentMethod) {
      case FulfillmentMethod.WAREHOUSE_EMAIL:
        return await handleWarehouseEmailFlow(
          context,
          agentSettings,
          orderNumber,
          cancellationRequestId,
        );

      case FulfillmentMethod.SHIPBOB:
        return await handleShipBobFlow(context, orderNumber, cancellationRequestId);

      case FulfillmentMethod.SHIPSTATION:
        return await handleShipStationFlow(context, orderNumber, cancellationRequestId);

      case FulfillmentMethod.SELF_FULFILLMENT:
        return await handleSelfFulfillmentFlow(context, orderNumber, cancellationRequestId);

      default:
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          `Unknown fulfillment method: ${fulfillmentMethod}`,
          { fulfillmentMethod, orderNumber },
        );
    }
  } catch (error) {
    if (error instanceof EscalationError) {
      if (context.state.cancellationRequestId) {
        console.error(error);
      }

      return {
        success: false,
        state: context.state,
        escalation: {
          id: '',
          type: error.type,
          reason: error.reason,
          metadata: error.metadata,
        },
        fulfillmentMethod,
        cancellationProcessed,
        refundProcessed,
        warehouseNotified,
        warehouseResponded,
        apiCancellationSuccess,
      };
    }

    throw error;
  }
}

/**
 * WAREHOUSE_EMAIL Flow
 */
async function handleWarehouseEmailFlow(
  context: ActionExecutionContext,
  agentSettings: OrderCancellationSettings,
  orderNumber: string,
  cancellationRequestId?: string,
): Promise<FulfillmentProcessingResult> {
  let warehouseNotified = false;
  let warehouseResponded = false;
  let cancellationProcessed = false;
  let refundProcessed = false;
  const fulfillmentMethod = FulfillmentMethod.WAREHOUSE_EMAIL;

  // Action 11: Send acknowledgement to customer
  const ackResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 11,
      description: 'Notify customer that cancellation is being processed',
    },
    async () => {
      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Cancellation Request`,
        `Thank you for contacting us about cancelling order ${orderNumber}.

We're on it — we're checking with our warehouse team to see if we can cancel this order before it ships.

We'll get back to you as soon as possible.`,
        context.email.threadId,
      );

      return { customerNotified: true };
    },
    context,
  );

  const ackFailure = buildFailureResult(context, ackResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    warehouseNotified,
    warehouseResponded,
  });
  if (ackFailure) return ackFailure;

  // Action 12: Send urgent email to warehouse
  const warehouseResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.CONTACT_WAREHOUSE,
      step: 12,
      description: 'Send cancellation request to warehouse',
    },
    async () => {
      const warehouseEmail = agentSettings.testMode
        ? agentSettings.testWarehouseEmail
        : agentSettings.warehouseEmail;

      if (!warehouseEmail) {
        throw new Error('Warehouse email not configured');
      }

      const subjectPrefix = agentSettings.testMode ? MESSAGE_PREFIXES.testMode : '';
      const urgentPrefix = MESSAGE_PREFIXES.urgentWarehouse;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        warehouseEmail,
        `${subjectPrefix} ${urgentPrefix} Cancel Order #${orderNumber}`,
        `${urgentPrefix}

Please respond to this email immediately with one of the following:

1. "Canceled" - if the order has been successfully cancelled
2. "Cannot cancel" or "Already shipped" - if the order has already shipped

Order Details:
- Order Number: ${orderNumber}
- Customer: ${context.state.wooOrder?.billing?.first_name} ${context.state.wooOrder?.billing?.last_name}
- Email: ${context.state.wooOrder?.billing?.email}
- Total: $${context.state.wooOrder?.total}

This requires immediate action. Please respond within 8 hours.

Thank you,
Automated Cancellation System`,
        context.email.threadId,
      );

      warehouseNotified = true;

      return {
        warehouseEmail,
        sentAt: new Date().toISOString(),
      };
    },
    context,
  );

  const warehouseFailure = buildFailureResult(context, warehouseResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    warehouseNotified,
    warehouseResponded,
  });
  if (warehouseFailure) return warehouseFailure;

  // Action 13: Wait for warehouse response
  const maxWaitMinutes = WAREHOUSE_REPLY_TIMEOUT_HOURS * 60;
  const checkIntervalMinutes = 10;
  const maxChecks = maxWaitMinutes / checkIntervalMinutes;
  let replyCheckCount = 0;
  let lastCheckedMessageId = context.email.messageId;

  while (!warehouseResponded && replyCheckCount < maxChecks) {
    await sleep(WAREHOUSE_REPLY_CHECK_INTERVAL);
    replyCheckCount++;

    const reply = await checkForCustomerReplyInThread(
      context.userId,
      context.email.threadId,
      lastCheckedMessageId,
    );

    if (reply.hasNewReply && reply.newEmail) {
      warehouseResponded = true;
      lastCheckedMessageId = reply.newEmail.messageId;

      const body = reply.newEmail.body || '';
      const parsedReply = parseWarehouseReply(body);

      if (parsedReply.uncertainty) {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          'Warehouse response is ambiguous',
          {
            warehouseReply: body,
            orderNumber,
          },
        );
      }

      if (parsedReply.canceled) {
        // Action 14: Process cancellation and refund
        const cancelResult = await executeWorkflowAction(
          {
            type: OrderCancellationActionType.PROCESS_CANCELLATION,
            step: 14,
            description: 'Cancel order and process refund in WooCommerce',
          },
          async () => {
            const result = await cancelAndRefundWooCommerceOrder(
              context.userId,
              orderNumber,
              'Order cancelled by customer request',
            );

            cancellationProcessed = true;
            refundProcessed = true;
            return result;
          },
          context,
        );

        const cancelFailure = buildFailureResult(context, cancelResult, fulfillmentMethod, {
          cancellationProcessed,
          refundProcessed,
          warehouseNotified,
          warehouseResponded,
        });
        if (cancelFailure) return cancelFailure;

        // Action 15: Send success notification
        const notifyResult = await executeWorkflowAction(
          {
            type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
            step: 15,
            description: 'Notify customer of successful cancellation',
          },
          async () => {
            await sendCustomerNotificationViaGmailThread(
              context.userId,
              context.email.fromEmail,
              `Order ${orderNumber} Successfully Cancelled`,
              `Good news! Your order ${orderNumber} has been successfully cancelled.

A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to reach out.

Thank you for your business!`,
              context.email.threadId,
            );

            return { customerNotified: true };
          },
          context,
        );

        const notifyFailure = buildFailureResult(context, notifyResult, fulfillmentMethod, {
          cancellationProcessed,
          refundProcessed,
          warehouseNotified,
          warehouseResponded,
        });
        if (notifyFailure) return notifyFailure;
      } else if (parsedReply.cannotCancel) {
        // Action 16: Send return instructions
        const returnResult = await executeWorkflowAction(
          {
            type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
            step: 16,
            description: 'Notify customer that order has shipped',
          },
          async () => {
            await sendCustomerNotificationViaGmailThread(
              context.userId,
              context.email.fromEmail,
              `Order ${orderNumber} - Return Instructions`,
              `Thank you for contacting us about order ${orderNumber}.

Unfortunately, this order has already shipped and cannot be cancelled.

However, you can return the order once you receive it. Here's how:

1. Keep the package in its original condition
2. Reply to this email to request a return label
3. We'll provide a prepaid shipping label
4. Drop off the package at the carrier location
5. Refund will be processed once we receive the return

If you have any questions, please let us know.

Thank you for your understanding!`,
              context.email.threadId,
            );

            return { customerNotified: true, returnInstructions: true };
          },
          context,
        );

        const returnFailure = buildFailureResult(context, returnResult, fulfillmentMethod, {
          cancellationProcessed,
          refundProcessed,
          warehouseNotified,
          warehouseResponded,
        });
        if (returnFailure) return returnFailure;
      }

      break;
    }
  }

  if (!warehouseResponded) {
    throw new EscalationError(
      EscalationType.WAREHOUSE_TIMEOUT,
      `No response from warehouse within ${WAREHOUSE_REPLY_TIMEOUT_HOURS} hours`,
      {
        orderNumber,
        hoursWaited: WAREHOUSE_REPLY_TIMEOUT_HOURS,
        checksPerformed: replyCheckCount,
      },
    );
  }

  return {
    success: true,
    state: context.state,
    fulfillmentMethod,
    cancellationProcessed,
    refundProcessed,
    warehouseNotified,
    warehouseResponded,
  };
}

/**
 * SHIPBOB Flow
 */
async function handleShipBobFlow(
  context: ActionExecutionContext,
  orderNumber: string,
  cancellationRequestId?: string,
): Promise<FulfillmentProcessingResult> {
  let cancellationProcessed = false;
  let refundProcessed = false;
  let apiCancellationSuccess = false;
  const fulfillmentMethod = FulfillmentMethod.SHIPBOB;

  // Action 11: Get ShipBob order
  let shipBobOrder: any;

  const shipBobFetch = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.FETCH_ORDER_DETAILS,
      step: 11,
      description: 'Fetch order from ShipBob',
    },
    async () => {
      shipBobOrder = await getShipBobOrderByReference(orderNumber);

      if (!shipBobOrder) {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          `Order ${orderNumber} not found in ShipBob`,
          { orderNumber },
        );
      }

      return {
        shipBobOrderId: shipBobOrder.id,
        status: shipBobOrder.status,
      };
    },
    context,
  );

  const fetchFailure = buildFailureResult(context, shipBobFetch, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (fetchFailure) return fetchFailure;

  // Action 12: Check eligibility
  const eligibilityResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.CHECK_TIME_ELIGIBILITY,
      step: 12,
      description: 'Check ShipBob cancellation eligibility',
    },
    async () => {
      const eligibility = await checkShipBobCancellationEligibility(shipBobOrder.id);

      if (!eligibility.eligible) {
        await sendCustomerNotificationViaGmailThread(
          context.userId,
          context.email.fromEmail,
          `Order ${orderNumber} - Return Instructions`,
          `Thank you for contacting us about order ${orderNumber}.

Unfortunately, this order has already been fulfilled by our warehouse and cannot be cancelled.

However, you can return the order once you receive it. Here's how:

1. Keep the package in its original condition
2. Reply to this email to request a return label
3. We'll provide a prepaid shipping label
4. Drop off the package at the carrier location
5. Refund will be processed once we receive the return

Reason: ${eligibility.reason}

If you have any questions, please let us know.

Thank you for your understanding!`,
          context.email.threadId,
        );

        throw new EscalationError(EscalationType.ORDER_NOT_ELIGIBLE, eligibility.reason, {
          orderNumber,
          shipBobOrderId: shipBobOrder.id,
          shipBobStatus: eligibility.order.status,
          customerNotified: true,
        });
      }

      return {
        eligible: true,
        shipBobOrderId: shipBobOrder.id,
        shipBobStatus: eligibility.order.status,
      };
    },
    context,
  );

  const eligibilityFailure = buildFailureResult(context, eligibilityResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (eligibilityFailure) return eligibilityFailure;

  // Action 13: Send acknowledgement to customer
  const ackResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 13,
      description: 'Notify customer that cancellation is being processed',
    },
    async () => {
      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Cancellation Request`,
        `Thank you for contacting us about cancelling order ${orderNumber}.

We're processing your cancellation request now with our fulfillment center.

You'll receive a confirmation shortly.`,
        context.email.threadId,
      );

      return { customerNotified: true };
    },
    context,
  );

  const ackFailure = buildFailureResult(context, ackResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (ackFailure) return ackFailure;

  // Action 14: Cancel via ShipBob API
  const cancelResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_CANCELLATION,
      step: 14,
      description: 'Cancel order in ShipBob',
    },
    async () => {
      const cancelResponse = await cancelShipBobOrder(shipBobOrder.id);

      if (!cancelResponse.success) {
        throw new EscalationError(
          EscalationType.API_CANCELLATION_FAILED,
          'Failed to cancel order via ShipBob API',
          {
            orderNumber,
            shipBobOrderId: shipBobOrder.id,
            cancelResult: cancelResponse,
          },
        );
      }

      apiCancellationSuccess = true;
      cancellationProcessed = true;

      return {
        success: true,
        shipBobOrderId: shipBobOrder.id,
        canceledShipments: cancelResponse.canceledShipments,
        failedShipments: cancelResponse.failedShipments,
      };
    },
    context,
  );

  const cancelFailure = buildFailureResult(context, cancelResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (cancelFailure) return cancelFailure;

  // Action 15: Process WooCommerce refund
  const refundResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_REFUND,
      step: 15,
      description: 'Process refund in WooCommerce',
    },
    async () => {
      const result = await cancelAndRefundWooCommerceOrder(
        context.userId,
        orderNumber,
        'Order cancelled by customer request',
      );

      refundProcessed = true;

      return result;
    },
    context,
  );

  const refundFailure = buildFailureResult(context, refundResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (refundFailure) return refundFailure;

  // Action 16: Send success notification
  const notifyResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 16,
      description: 'Notify customer of successful cancellation',
    },
    async () => {
      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Successfully Cancelled`,
        `Good news! Your order ${orderNumber} has been successfully cancelled.

A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to reach out.

Thank you for your business!`,
        context.email.threadId,
      );

      return { customerNotified: true };
    },
    context,
  );

  const notifyFailure = buildFailureResult(context, notifyResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (notifyFailure) return notifyFailure;

  return {
    success: true,
    state: context.state,
    fulfillmentMethod,
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  };
}

/**
 * SHIPSTATION Flow
 */
async function handleShipStationFlow(
  context: ActionExecutionContext,
  orderNumber: string,
  cancellationRequestId?: string,
): Promise<FulfillmentProcessingResult> {
  let cancellationProcessed = false;
  let refundProcessed = false;
  let apiCancellationSuccess = false;
  const fulfillmentMethod = FulfillmentMethod.SHIPSTATION;

  // Action 11: Get ShipStation order
  let shipStationOrder: any;

  const shipStationFetch = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.FETCH_ORDER_DETAILS,
      step: 11,
      description: 'Fetch order from ShipStation',
    },
    async () => {
      shipStationOrder = await getShipStationOrderByNumber(orderNumber);

      if (!shipStationOrder) {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          `Order ${orderNumber} not found in ShipStation`,
          { orderNumber },
        );
      }

      return {
        shipStationOrderId: shipStationOrder.orderId,
        orderStatus: shipStationOrder.orderStatus,
      };
    },
    context,
  );

  const fetchFailure = buildFailureResult(context, shipStationFetch, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (fetchFailure) return fetchFailure;

  // Action 12: Check eligibility
  const eligibilityResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.CHECK_TIME_ELIGIBILITY,
      step: 12,
      description: 'Check ShipStation cancellation eligibility',
    },
    async () => {
      const eligibility = await checkShipStationCancellationEligibility(orderNumber);

      if (!eligibility.eligible) {
        await sendCustomerNotificationViaGmailThread(
          context.userId,
          context.email.fromEmail,
          `Order ${orderNumber} - Return Instructions`,
          `Thank you for contacting us about order ${orderNumber}.

Unfortunately, this order has already been shipped and cannot be cancelled.

However, you can return the order once you receive it. Here's how:

1. Keep the package in its original condition
2. Reply to this email to request a return label
3. We'll provide a prepaid shipping label
4. Drop off the package at the carrier location
5. Refund will be processed once we receive the return

Reason: ${eligibility.reason}

If you have any questions, please let us know.

Thank you for your understanding!`,
          context.email.threadId,
        );

        throw new EscalationError(EscalationType.ORDER_NOT_ELIGIBLE, eligibility.reason, {
          orderNumber,
          shipStationOrderId: shipStationOrder.orderId,
          orderStatus: eligibility.order.orderStatus,
          customerNotified: true,
        });
      }

      return {
        eligible: true,
        shipStationOrderId: shipStationOrder.orderId,
        orderStatus: eligibility.order.orderStatus,
      };
    },
    context,
  );

  const eligibilityFailure = buildFailureResult(context, eligibilityResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (eligibilityFailure) return eligibilityFailure;

  // Action 13: Send acknowledgement to customer
  const ackResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 13,
      description: 'Notify customer that cancellation is being processed',
    },
    async () => {
      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Cancellation Request`,
        `Thank you for contacting us about cancelling order ${orderNumber}.

We're processing your cancellation request now with our shipping provider.

You'll receive a confirmation shortly.`,
        context.email.threadId,
      );

      return { customerNotified: true };
    },
    context,
  );

  const ackFailure = buildFailureResult(context, ackResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (ackFailure) return ackFailure;

  // Action 14: Cancel via ShipStation API
  const cancelResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_CANCELLATION,
      step: 14,
      description: 'Cancel order in ShipStation',
    },
    async () => {
      const cancelResponse = await cancelShipStationOrder(orderNumber);

      if (!cancelResponse.success) {
        throw new EscalationError(
          EscalationType.API_CANCELLATION_FAILED,
          'Failed to cancel order via ShipStation API',
          {
            orderNumber,
            shipStationOrderId: shipStationOrder.orderId,
            cancelResult: cancelResponse,
          },
        );
      }

      apiCancellationSuccess = true;
      cancellationProcessed = true;

      return {
        success: true,
        shipStationOrderId: shipStationOrder.orderId,
        voidedLabels: cancelResponse.voidedLabels,
      };
    },
    context,
  );

  const cancelFailure = buildFailureResult(context, cancelResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (cancelFailure) return cancelFailure;

  // Action 15: Process WooCommerce refund
  const refundResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_REFUND,
      step: 15,
      description: 'Process refund in WooCommerce',
    },
    async () => {
      const result = await cancelAndRefundWooCommerceOrder(
        context.userId,
        orderNumber,
        'Order cancelled by customer request',
      );

      refundProcessed = true;

      return result;
    },
    context,
  );

  const refundFailure = buildFailureResult(context, refundResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (refundFailure) return refundFailure;

  // Action 16: Send success notification
  const notifyResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 16,
      description: 'Notify customer of successful cancellation',
    },
    async () => {
      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Successfully Cancelled`,
        `Good news! Your order ${orderNumber} has been successfully cancelled.

A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to reach out.

Thank you for your business!`,
        context.email.threadId,
      );

      return { customerNotified: true };
    },
    context,
  );

  const notifyFailure = buildFailureResult(context, notifyResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  });
  if (notifyFailure) return notifyFailure;

  return {
    success: true,
    state: context.state,
    fulfillmentMethod,
    cancellationProcessed,
    refundProcessed,
    apiCancellationSuccess,
  };
}

/**
 * SELF_FULFILLMENT Flow
 */
async function handleSelfFulfillmentFlow(
  context: ActionExecutionContext,
  orderNumber: string,
  cancellationRequestId?: string,
): Promise<FulfillmentProcessingResult> {
  let cancellationProcessed = false;
  let refundProcessed = false;
  const fulfillmentMethod = FulfillmentMethod.SELF_FULFILLMENT;

  // Action 11: Send acknowledgement
  const ackResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 11,
      description: 'Notify customer that cancellation is being processed',
    },
    async () => {
      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Cancellation Request`,
        `Thank you for contacting us about cancelling order ${orderNumber}.

We're processing your cancellation request now.

You'll receive a confirmation shortly.`,
        context.email.threadId,
      );

      return { customerNotified: true };
    },
    context,
  );

  const ackFailure = buildFailureResult(context, ackResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
  });
  if (ackFailure) return ackFailure;

  // Action 12: Cancel and refund in WooCommerce
  const cancelResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_CANCELLATION,
      step: 12,
      description: 'Cancel order and process refund',
    },
    async () => {
      const result = await cancelAndRefundWooCommerceOrder(
        context.userId,
        orderNumber,
        'Order cancelled by customer request',
      );

      cancellationProcessed = true;
      refundProcessed = true;

      return result;
    },
    context,
  );

  const cancelFailure = buildFailureResult(context, cancelResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
  });
  if (cancelFailure) return cancelFailure;

  // Action 13: Send success notification
  const notifyResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 13,
      description: 'Notify customer of successful cancellation',
    },
    async () => {
      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Successfully Cancelled`,
        `Good news! Your order ${orderNumber} has been successfully cancelled.

A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to reach out.

Thank you for your business!`,
        context.email.threadId,
      );

      return { customerNotified: true };
    },
    context,
  );

  const notifyFailure = buildFailureResult(context, notifyResult, fulfillmentMethod, {
    cancellationProcessed,
    refundProcessed,
  });
  if (notifyFailure) return notifyFailure;

  return {
    success: true,
    state: context.state,
    fulfillmentMethod,
    cancellationProcessed,
    refundProcessed,
  };
}
