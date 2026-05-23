import { log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../../activities/shared/email.activities';
import type { AiIdentityActivities } from '../../../../../activities/shared/ai-identity.activities';
import type { OrderActivities } from '../../../../../activities/shared/order.activities';
import type { OrderCancellationActivities } from '../../../../../activities/agents/order-cancellation/order-cancellation.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  OrderCancellationActionType,
} from '../../../../types';
import { executeWorkflowAction, extractCustomerName } from '../../../../workflow-action.helpers';
import {
  ACTIVITY_TIMEOUTS,
  REFUND_TIMELINE_BUSINESS_DAYS,
} from '../../order-cancellation.constants';
import { extractEmail, formatWooCommerceOrder } from '../../order-cancellation.helpers';
import {
  FulfillmentExecutionResult,
  OrderCancellationWorkflowState,
} from '../../order-cancellation.types';
import { buildOrderCancellationFailureResult } from '../order-cancellation-subworkflow.helpers';
import {
  FulfillmentMethod,
  resolveRefundAmount,
  toCurrencyString,
} from './order-cancellation-fulfillment.shared';

const NON_CANCELLABLE_WOO_STATUSES = new Set([
  'completed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'failed',
]);

function extractPlainEmailAddress(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.match(/<([^>]+)>/);
  return (match ? match[1] : email).trim().toLowerCase();
}

export async function handleShipBobFulfillmentMethod(
  context: ActionExecutionContext<OrderCancellationWorkflowState>,
  fulfillmentMethod: FulfillmentMethod,
): Promise<FulfillmentExecutionResult> {
  const emailActivities = proxyActivities<typeof EmailActivities.prototype>(
    ACTIVITY_TIMEOUTS.EMAIL,
  );
  const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
    ACTIVITY_TIMEOUTS.AI_IDENTITY,
  );
  const orderActivities = proxyActivities<typeof OrderActivities.prototype>(
    ACTIVITY_TIMEOUTS.ORDER,
  );
  const orderCancellationActivities = proxyActivities<typeof OrderCancellationActivities.prototype>(
    ACTIVITY_TIMEOUTS.ORDER,
  );

  const { sendCustomerNotificationViaThread } = emailActivities;
  const { getAiIdentity } = aiIdentityActivities;
  const { getWooCommerceOrderById } = orderActivities;
  const {
    getShipBobOrderByWooCommerceOrderId,
    checkShipBobCancellationEligibility,
    cancelShipBobOrderByWooCommerceOrderId,
    updateWooCommerceOrderStatus,
    processWooCommerceRefund,
    generateShipBobProcessingMessage,
    generateShipBobCannotCancelMessage,
    generateRefundProcessedMessage,
  } = orderCancellationActivities;

  const customerName = extractCustomerName(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.email.userId);

  let cancellationProcessed = false;
  let refundProcessed = false;

  const latestOrder = await getWooCommerceOrderById(
    context.userId,
    context.state.orderNumber as string,
  );
  context.state.wooOrder = formatWooCommerceOrder(latestOrder);

  const wooOrderStatus = (latestOrder?.status || '').toLowerCase();
  const customerEmailFromOrder = extractPlainEmailAddress(latestOrder?.billing?.email);
  const senderEmail = extractPlainEmailAddress(context.email.fromEmail);

  const validateCustomerEmailResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.VALIDATE_CUSTOMER_EMAIL,
      step: 6.0,
      description: 'Validate customer email matches order records',
      actionDetails:
        'Confirming request sender email matches WooCommerce billing email before ShipBob cancellation.',
      skipApproval: true,
      metadata: {
        senderEmail,
        orderEmail: customerEmailFromOrder,
        orderNumber: context.state.orderNumber,
      },
    },
    async () => {
      if (!senderEmail || !customerEmailFromOrder || senderEmail !== customerEmailFromOrder) {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          'Customer email does not match order billing email',
          {
            senderEmail,
            customerEmailFromOrder,
            orderNumber: context.state.orderNumber,
          },
        );
      }
      return { valid: true };
    },
    context,
  );
  const validateCustomerEmailFailure = buildOrderCancellationFailureResult(
    context.state,
    validateCustomerEmailResult,
  );
  if (validateCustomerEmailFailure) {
    return {
      ...validateCustomerEmailFailure,
      fulfillmentMethod,
      cancellationEligible: false,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  if (NON_CANCELLABLE_WOO_STATUSES.has(wooOrderStatus)) {
    const cannotCancelMessage = await generateShipBobCannotCancelMessage(
      context.state.orderNumber as string,
      `WooCommerce status is ${wooOrderStatus}`,
      customerName,
      aiIdentity,
    );

    const cannotCancelResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
        step: 6.1,
        description: 'Send cannot-cancel response to customer',
        actionDetails:
          'WooCommerce status indicates cancellation is too late. Sending customer guidance with return next-step info.',
        proposedEmailBody: cannotCancelMessage,
        metadata: {
          orderStatus: wooOrderStatus,
          orderNumber: context.state.orderNumber,
          fulfillmentMethod,
        },
      },
      async (humanResponse) => {
        const messageToSend = humanResponse?.modifiedData?.message ?? cannotCancelMessage;
        await sendCustomerNotificationViaThread(
          context.email.userId,
          extractEmail(context.email.fromEmail),
          context.email.subject ?? '',
          messageToSend,
          context.email.threadId,
        );
        return { sent: true };
      },
      context,
    );

    const cannotCancelFailure = buildOrderCancellationFailureResult(
      context.state,
      cannotCancelResult,
    );
    if (cannotCancelFailure) {
      return {
        ...cannotCancelFailure,
        fulfillmentMethod,
        cancellationEligible: false,
        cancellationProcessed: false,
        refundProcessed: false,
        confirmationSent: false,
      };
    }

    return {
      success: true,
      state: context.state,
      fulfillmentMethod,
      cancellationEligible: false,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: true,
    };
  }

  const resolveShipBobOrderResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.FETCH_ORDER_DETAILS,
      step: 6.2,
      description: 'Resolve linked ShipBob order',
      actionDetails:
        'Looking up the ShipBob order using WooCommerce order number before cancellation eligibility checks.',
      skipApproval: true,
      metadata: {
        orderNumber: context.state.orderNumber,
      },
    },
    async () => {
      const shipBobOrder = await getShipBobOrderByWooCommerceOrderId(
        context.userId,
        context.state.orderNumber as string,
      );
      if (!shipBobOrder) {
        throw new EscalationError(
          EscalationType.ORDER_NOT_FOUND,
          'No ShipBob order found for this WooCommerce order. Verify the ShipBob order reference ID matches the WooCommerce order number.',
          {
            orderNumber: context.state.orderNumber,
            fulfillmentMethod,
            troubleshootingHint:
              'Confirm ShipBob order reference_id equals WooCommerce order number and that the order exists in the connected ShipBob account/channel.',
          },
        );
      }
      return { shipBobOrder };
    },
    context,
  );
  const resolveShipBobOrderFailure = buildOrderCancellationFailureResult(
    context.state,
    resolveShipBobOrderResult,
  );
  if (resolveShipBobOrderFailure) {
    return {
      ...resolveShipBobOrderFailure,
      fulfillmentMethod,
      cancellationEligible: false,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const shipBobOrder = resolveShipBobOrderResult.result?.shipBobOrder;
  const eligibilityResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.CHECK_TIME_ELIGIBILITY,
      step: 6.3,
      description: 'Check ShipBob cancellation eligibility',
      actionDetails:
        'Checking ShipBob order and shipment statuses to confirm cancellation can still be completed automatically.',
      skipApproval: true,
      metadata: {
        orderNumber: context.state.orderNumber,
        shipBobOrderId: shipBobOrder?.id,
      },
    },
    async () => {
      const eligibility = await checkShipBobCancellationEligibility(
        context.userId,
        shipBobOrder.id,
      );
      return { eligibility };
    },
    context,
  );
  const eligibilityFailure = buildOrderCancellationFailureResult(context.state, eligibilityResult);
  if (eligibilityFailure) {
    return {
      ...eligibilityFailure,
      fulfillmentMethod,
      cancellationEligible: false,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const shipBobEligibility = eligibilityResult.result?.eligibility;
  if (!shipBobEligibility?.eligible) {
    const cannotCancelMessage = await generateShipBobCannotCancelMessage(
      context.state.orderNumber as string,
      shipBobEligibility?.reason || 'ShipBob marked this order as not cancellable',
      customerName,
      aiIdentity,
    );

    const cannotCancelResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
        step: 6.4,
        description: 'Send cannot-cancel response to customer',
        actionDetails:
          'ShipBob indicates cancellation is not eligible. Sending customer final guidance and return next-step info.',
        proposedEmailBody: cannotCancelMessage,
        metadata: {
          orderNumber: context.state.orderNumber,
          shipBobReason: shipBobEligibility?.reason,
        },
      },
      async (humanResponse) => {
        const messageToSend = humanResponse?.modifiedData?.message ?? cannotCancelMessage;
        await sendCustomerNotificationViaThread(
          context.email.userId,
          extractEmail(context.email.fromEmail),
          context.email.subject ?? '',
          messageToSend,
          context.email.threadId,
        );
        return { sent: true };
      },
      context,
    );
    const cannotCancelFailure = buildOrderCancellationFailureResult(
      context.state,
      cannotCancelResult,
    );
    if (cannotCancelFailure) {
      return {
        ...cannotCancelFailure,
        fulfillmentMethod,
        cancellationEligible: false,
        cancellationProcessed: false,
        refundProcessed: false,
        confirmationSent: false,
      };
    }

    return {
      success: true,
      state: context.state,
      fulfillmentMethod,
      cancellationEligible: false,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: true,
    };
  }

  const processingMessage = await generateShipBobProcessingMessage(
    context.state.orderNumber as string,
    customerName,
    aiIdentity,
  );
  const processingAckResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 6.5,
      description: 'Send ShipBob processing acknowledgement',
      actionDetails:
        'Cancellation is eligible in ShipBob. Sending customer update that cancellation is actively being processed.',
      proposedEmailBody: processingMessage,
      metadata: {
        orderNumber: context.state.orderNumber,
        shipBobOrderId: shipBobOrder?.id,
      },
    },
    async (humanResponse) => {
      const messageToSend = humanResponse?.modifiedData?.message ?? processingMessage;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        extractEmail(context.email.fromEmail),
        context.email.subject ?? '',
        messageToSend,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );
  const processingAckFailure = buildOrderCancellationFailureResult(
    context.state,
    processingAckResult,
  );
  if (processingAckFailure) {
    return {
      ...processingAckFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const shipBobCancelResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_CANCELLATION,
      step: 7,
      description: 'Cancel order in ShipBob',
      actionDetails:
        'Submitting cancellation request to ShipBob for the linked fulfillment order before WooCommerce status/refund updates.',
      metadata: {
        orderNumber: context.state.orderNumber,
        shipBobOrderId: shipBobOrder?.id,
      },
    },
    async () => {
      const cancellation = await cancelShipBobOrderByWooCommerceOrderId(
        context.userId,
        context.state.orderNumber as string,
      );

      if (!cancellation?.success) {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          'ShipBob cancellation did not complete successfully',
          {
            orderNumber: context.state.orderNumber,
            shipBobOrderId: shipBobOrder?.id,
            shipBobCancellation: cancellation,
          },
        );
      }

      return { cancellation };
    },
    context,
  );
  const shipBobCancelFailure = buildOrderCancellationFailureResult(
    context.state,
    shipBobCancelResult,
  );
  if (shipBobCancelFailure) {
    return {
      ...shipBobCancelFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const wooCancelResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_CANCELLATION,
      step: 7.1,
      description: `Update WooCommerce order #${context.state.orderNumber} status to cancelled`,
      actionDetails:
        'Syncing WooCommerce order status to cancelled after successful ShipBob cancellation.',
      skipApproval: true,
    },
    async () => {
      const cancelledOrder = await updateWooCommerceOrderStatus(
        context.userId,
        context.state.orderNumber as string,
        'cancelled',
      );
      context.state.wooOrder = formatWooCommerceOrder(cancelledOrder);
      return { status: cancelledOrder?.status || 'cancelled' };
    },
    context,
  );
  const wooCancelFailure = buildOrderCancellationFailureResult(context.state, wooCancelResult);
  if (wooCancelFailure) {
    return {
      ...wooCancelFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }
  cancellationProcessed = true;

  const refundResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_REFUND,
      step: 8,
      description: `Process refund for order #${context.state.orderNumber}`,
      actionDetails: 'Processing full WooCommerce refund after successful ShipBob cancellation.',
    },
    async () => {
      const latestOrderForRefund = await getWooCommerceOrderById(
        context.userId,
        context.state.orderNumber as string,
      );
      const refundAmount = resolveRefundAmount(latestOrderForRefund);
      if (!refundAmount) {
        throw new EscalationError(
          EscalationType.ORDER_ALREADY_PROCESSED,
          'No refundable amount available for this order',
          {
            orderNumber: context.state.orderNumber,
            total: latestOrderForRefund?.total,
            totalRefunded: (latestOrderForRefund as any)?.total_refunded,
          },
        );
      }

      const refund = await processWooCommerceRefund(
        context.userId,
        context.state.orderNumber as string,
        {
          amount: refundAmount,
          reason: 'ShipBob cancellation refund',
          apiRefund: true,
          restockRefundedItems: true,
        },
      );

      const refundedAmount = toCurrencyString(refund?.amount) || refundAmount;
      context.state.cancellationResult = {
        ...(context.state.cancellationResult || {}),
        orderStatusUpdated: true,
        refundProcessed: true,
        refundId: refund?.id?.toString(),
        refundedAmount,
      };

      return { refundId: refund?.id, refundedAmount };
    },
    context,
  );
  const refundFailure = buildOrderCancellationFailureResult(context.state, refundResult);
  if (refundFailure) {
    return {
      ...refundFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: true,
      refundProcessed: false,
      confirmationSent: false,
    };
  }
  refundProcessed = true;

  const successMessage = await generateRefundProcessedMessage(
    context.state.orderNumber as string,
    customerName,
    context.state.cancellationResult?.refundedAmount,
    REFUND_TIMELINE_BUSINESS_DAYS,
    aiIdentity,
  );
  const successNotificationResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 9,
      description: 'Send final success notification to customer',
      actionDetails:
        'Sending final confirmation that cancellation and refund were completed successfully through ShipBob fulfillment.',
      proposedEmailBody: successMessage,
      metadata: {
        orderNumber: context.state.orderNumber,
        refundedAmount: context.state.cancellationResult?.refundedAmount,
        refundTimeline: REFUND_TIMELINE_BUSINESS_DAYS,
        fulfillmentMethod,
      },
    },
    async (humanResponse) => {
      const messageToSend = humanResponse?.modifiedData?.message ?? successMessage;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        extractEmail(context.email.fromEmail),
        context.email.subject ?? '',
        messageToSend,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );
  const successNotificationFailure = buildOrderCancellationFailureResult(
    context.state,
    successNotificationResult,
  );
  if (successNotificationFailure) {
    return {
      ...successNotificationFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: true,
      refundProcessed: true,
      confirmationSent: false,
    };
  }

  log.info('ShipBob fulfillment completed successfully', {
    orderNumber: context.state.orderNumber,
    shipBobOrderId: shipBobOrder?.id,
    cancellationProcessed,
    refundProcessed,
  });

  return {
    success: true,
    state: context.state,
    fulfillmentMethod,
    cancellationEligible: true,
    cancellationProcessed: true,
    refundProcessed: true,
    confirmationSent: true,
  };
}
