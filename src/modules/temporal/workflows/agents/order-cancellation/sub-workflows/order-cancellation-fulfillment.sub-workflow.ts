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
): Promise<FulfillmentProcessingResult> {
  const fulfillmentMethod = {} as any;
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
          {} as any,
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
  const warehouseAckBody = `Thank you for contacting us about cancelling order ${orderNumber}.

We're on it — we're checking with our warehouse team to see if we can cancel this order before it ships.

We'll get back to you as soon as possible.`;

  const ackResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 11,
      description: 'Notify customer that cancellation is being processed',
      actionDetails: `Sending an acknowledgement email to ${context.email.fromEmail} confirming that their cancellation request for order #${orderNumber} has been received and is being processed with the warehouse team. Input: Order number, customer email. Output: Acknowledgement email sent to customer.`,
      proposedEmailBody: warehouseAckBody,
    },
    async (humanResponse) => {
      const bodyToSend = humanResponse?.modifiedData?.message ?? warehouseAckBody;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Cancellation Request`,
        bodyToSend,
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
  const warehouseEmailAddress = agentSettings.testMode
    ? agentSettings.testWarehouseEmail
    : agentSettings.warehouseEmail;
  const subjectPrefix = agentSettings.testMode ? MESSAGE_PREFIXES.testMode : '';
  const urgentPrefix = MESSAGE_PREFIXES.urgentWarehouse;

  const warehouseContactBody = `${urgentPrefix}

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
Automated Cancellation System`;

  const warehouseResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.CONTACT_WAREHOUSE,
      step: 12,
      description: 'Send cancellation request to warehouse',
      actionDetails: `Sending an urgent cancellation request to the warehouse team (${warehouseEmailAddress || 'not configured'}) for order #${orderNumber}. The system will then wait up to ${WAREHOUSE_REPLY_TIMEOUT_HOURS} hours for their response. Input: Order number, customer and order details. Output: Warehouse email sent, awaiting reply.`,
      proposedEmailBody: warehouseContactBody,
    },
    async (humanResponse) => {
      if (!warehouseEmailAddress) {
        throw new Error('Warehouse email not configured');
      }

      const bodyToSend = humanResponse?.modifiedData?.message ?? warehouseContactBody;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        warehouseEmailAddress,
        `${subjectPrefix} ${urgentPrefix} Cancel Order #${orderNumber}`,
        bodyToSend,
        context.email.threadId,
      );

      warehouseNotified = true;

      return {
        warehouseEmail: warehouseEmailAddress,
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
            actionDetails: `Warehouse confirmed cancellation. Cancelling order #${orderNumber} in WooCommerce and initiating a full refund of $${context.state.wooOrder?.total}. Input: Order number, cancellation reason. Output: Order cancelled, refund initiated.`,
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
        const warehouseSuccessBody = `Good news! Your order ${orderNumber} has been successfully cancelled.

A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to reach out.

Thank you for your business!`;

        const notifyResult = await executeWorkflowAction(
          {
            type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
            step: 15,
            description: 'Notify customer of successful cancellation',
            actionDetails: `Sending a cancellation success notification to ${context.email.fromEmail} for order #${orderNumber}. Confirms the cancellation and refund timeline. Input: Order number, refund amount ($${context.state.wooOrder?.total}), customer email. Output: Success notification sent.`,
            proposedEmailBody: warehouseSuccessBody,
          },
          async (humanResponse) => {
            const bodyToSend = humanResponse?.modifiedData?.message ?? warehouseSuccessBody;

            await sendCustomerNotificationViaGmailThread(
              context.userId,
              context.email.fromEmail,
              `Order ${orderNumber} Successfully Cancelled`,
              bodyToSend,
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
        const returnInstructionsBody = `Thank you for contacting us about order ${orderNumber}.

Unfortunately, this order has already shipped and cannot be cancelled.

However, you can return the order once you receive it. Here's how:

1. Keep the package in its original condition
2. Reply to this email to request a return label
3. We'll provide a prepaid shipping label
4. Drop off the package at the carrier location
5. Refund will be processed once we receive the return

If you have any questions, please let us know.

Thank you for your understanding!`;

        const returnResult = await executeWorkflowAction(
          {
            type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
            step: 16,
            description: 'Notify customer that order has shipped',
            actionDetails: `Order #${orderNumber} has already shipped and cannot be cancelled. Sending return instructions to ${context.email.fromEmail} explaining how to initiate a return once the package arrives. Input: Order number, customer email. Output: Return instructions email sent.`,
            proposedEmailBody: returnInstructionsBody,
          },
          async (humanResponse) => {
            const bodyToSend = humanResponse?.modifiedData?.message ?? returnInstructionsBody;

            await sendCustomerNotificationViaGmailThread(
              context.userId,
              context.email.fromEmail,
              `Order ${orderNumber} - Return Instructions`,
              bodyToSend,
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
      actionDetails: `Fetching order #${orderNumber} from ShipBob fulfillment system to check its current fulfillment status and cancellation eligibility. Input: Order reference number. Output: ShipBob order ID and fulfillment status.`,
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
      actionDetails: `Checking if order #${orderNumber} can still be cancelled in ShipBob based on its current fulfillment status. If already fulfilled/shipped, the customer will be notified with return instructions. Input: ShipBob order ID. Output: Eligible (continue) or not eligible (notify customer and escalate).`,
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
  const shipBobAckBody = `Thank you for contacting us about cancelling order ${orderNumber}.

We're processing your cancellation request now with our fulfillment center.

You'll receive a confirmation shortly.`;

  const ackResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 13,
      description: 'Notify customer that cancellation is being processed',
      actionDetails: `Sending an acknowledgement email to ${context.email.fromEmail} confirming their cancellation request for order #${orderNumber} is being processed with the fulfillment center. Input: Order number, customer email. Output: Acknowledgement email sent.`,
      proposedEmailBody: shipBobAckBody,
    },
    async (humanResponse) => {
      const bodyToSend = humanResponse?.modifiedData?.message ?? shipBobAckBody;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Cancellation Request`,
        bodyToSend,
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
      actionDetails: `Sending a cancellation request to the ShipBob API for order #${orderNumber}. Input: ShipBob order ID. Output: Cancellation confirmation with cancelled/failed shipment details, or escalation on failure.`,
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
      actionDetails: `Processing a full refund for order #${orderNumber} in WooCommerce after successful ShipBob cancellation. Input: Order number, cancellation reason. Output: Refund initiated in WooCommerce.`,
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
  const shipBobSuccessBody = `Good news! Your order ${orderNumber} has been successfully cancelled.

A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to reach out.

Thank you for your business!`;

  const notifyResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 16,
      description: 'Notify customer of successful cancellation',
      actionDetails: `Sending a cancellation success notification to ${context.email.fromEmail} for order #${orderNumber}. Confirms the cancellation and refund timeline. Input: Order number, refund amount ($${context.state.wooOrder?.total}), customer email. Output: Success notification sent.`,
      proposedEmailBody: shipBobSuccessBody,
    },
    async (humanResponse) => {
      const bodyToSend = humanResponse?.modifiedData?.message ?? shipBobSuccessBody;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Successfully Cancelled`,
        bodyToSend,
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
      actionDetails: `Fetching order #${orderNumber} from ShipStation to check its current shipping status and cancellation eligibility. Input: Order number. Output: ShipStation order ID and order status.`,
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
      actionDetails: `Checking if order #${orderNumber} can still be cancelled in ShipStation based on its current shipping status. If already shipped, the customer will be notified with return instructions. Input: Order number. Output: Eligible (continue) or not eligible (notify customer and escalate).`,
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
  const shipStationAckBody = `Thank you for contacting us about cancelling order ${orderNumber}.

We're processing your cancellation request now with our shipping provider.

You'll receive a confirmation shortly.`;

  const ackResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 13,
      description: 'Notify customer that cancellation is being processed',
      actionDetails: `Sending an acknowledgement email to ${context.email.fromEmail} confirming their cancellation request for order #${orderNumber} is being processed with the shipping provider. Input: Order number, customer email. Output: Acknowledgement email sent.`,
      proposedEmailBody: shipStationAckBody,
    },
    async (humanResponse) => {
      const bodyToSend = humanResponse?.modifiedData?.message ?? shipStationAckBody;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Cancellation Request`,
        bodyToSend,
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
      actionDetails: `Sending a cancellation request to the ShipStation API for order #${orderNumber}. Input: Order number. Output: Cancellation confirmation with voided labels, or escalation on failure.`,
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
      actionDetails: `Processing a full refund for order #${orderNumber} in WooCommerce after successful ShipStation cancellation. Input: Order number, cancellation reason. Output: Refund initiated in WooCommerce.`,
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
  const shipStationSuccessBody = `Good news! Your order ${orderNumber} has been successfully cancelled.

A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to reach out.

Thank you for your business!`;

  const notifyResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 16,
      description: 'Notify customer of successful cancellation',
      actionDetails: `Sending a cancellation success notification to ${context.email.fromEmail} for order #${orderNumber}. Confirms the cancellation and refund timeline. Input: Order number, refund amount ($${context.state.wooOrder?.total}), customer email. Output: Success notification sent.`,
      proposedEmailBody: shipStationSuccessBody,
    },
    async (humanResponse) => {
      const bodyToSend = humanResponse?.modifiedData?.message ?? shipStationSuccessBody;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Successfully Cancelled`,
        bodyToSend,
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
  const selfAckBody = `Thank you for contacting us about cancelling order ${orderNumber}.

We're processing your cancellation request now.

You'll receive a confirmation shortly.`;

  const ackResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 11,
      description: 'Notify customer that cancellation is being processed',
      actionDetails: `Sending an acknowledgement email to ${context.email.fromEmail} confirming their cancellation request for order #${orderNumber} is being processed. Input: Order number, customer email. Output: Acknowledgement email sent.`,
      proposedEmailBody: selfAckBody,
    },
    async (humanResponse) => {
      const bodyToSend = humanResponse?.modifiedData?.message ?? selfAckBody;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Cancellation Request`,
        bodyToSend,
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
      actionDetails: `Cancelling order #${orderNumber} directly in WooCommerce and initiating a full refund of $${context.state.wooOrder?.total}. Input: Order number, cancellation reason. Output: Order cancelled and refund initiated.`,
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
  const selfSuccessBody = `Good news! Your order ${orderNumber} has been successfully cancelled.

A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to reach out.

Thank you for your business!`;

  const notifyResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 13,
      description: 'Notify customer of successful cancellation',
      actionDetails: `Sending a cancellation success notification to ${context.email.fromEmail} for order #${orderNumber}. Confirms the cancellation and refund timeline. Input: Order number, refund amount ($${context.state.wooOrder?.total}), customer email. Output: Success notification sent.`,
      proposedEmailBody: selfSuccessBody,
    },
    async (humanResponse) => {
      const bodyToSend = humanResponse?.modifiedData?.message ?? selfSuccessBody;

      await sendCustomerNotificationViaGmailThread(
        context.userId,
        context.email.fromEmail,
        `Order ${orderNumber} Successfully Cancelled`,
        bodyToSend,
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
