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

export async function handleSelfFulfillmentMethod(
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
    updateWooCommerceOrderStatus,
    processWooCommerceRefund,
    generateCancellationProcessedMessage,
    generateRefundProcessedMessage,
  } = orderCancellationActivities;

  const customerName = extractCustomerName(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.email.userId);

  let cancellationProcessed = false;
  let refundProcessed = false;
  let confirmationSent = false;
  const partialFulfillmentDetected = false;

  const cancellationResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_CANCELLATION,
      step: 7,
      description: `Update order #${context.state.orderNumber} status to cancelled`,
      actionDetails:
        'Marking order as cancelled in WooCommerce to stop fulfillment and reflect cancellation outcome.',
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

  const cancellationFailure = buildOrderCancellationFailureResult(
    context.state,
    cancellationResult,
  );
  if (cancellationFailure) {
    return {
      ...cancellationFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }
  cancellationProcessed = true;

  const cancellationStatusMessage = await generateCancellationProcessedMessage(
    context.state.orderNumber as string,
    customerName,
    partialFulfillmentDetected,
    aiIdentity,
  );

  const cancellationNotificationResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 7.1,
      description: 'Notify customer that cancellation is completed',
      actionDetails:
        'Sending a status update email to confirm the order has been cancelled successfully. Refund details are sent in a separate follow-up email.',
      proposedEmailBody: cancellationStatusMessage,
      metadata: {
        orderNumber: context.state.orderNumber,
        partialFulfillmentDetected,
        stage: 'cancellation_completed',
      },
    },
    async (humanResponse) => {
      const messageToSend = humanResponse?.modifiedData?.message ?? cancellationStatusMessage;
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

  const cancellationNotificationFailure = buildOrderCancellationFailureResult(
    context.state,
    cancellationNotificationResult,
  );
  if (cancellationNotificationFailure) {
    return {
      ...cancellationNotificationFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: true,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const refundResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_REFUND,
      step: 8,
      description: `Process refund for order #${context.state.orderNumber}`,
      actionDetails:
        'Processing WooCommerce refund for the cancellation. Full refund is attempted for eligible self-fulfillment orders.',
    },
    async () => {
      const latestOrder = await getWooCommerceOrderById(
        context.userId,
        context.state.orderNumber as string,
      );

      const refundAmount = resolveRefundAmount(latestOrder);
      if (!refundAmount) {
        throw new EscalationError(
          EscalationType.ORDER_ALREADY_PROCESSED,
          'No refundable amount available for this order',
          {
            orderNumber: context.state.orderNumber,
            total: latestOrder?.total,
            totalRefunded: (latestOrder as any)?.total_refunded,
          },
        );
      }

      const refund = await processWooCommerceRefund(
        context.userId,
        context.state.orderNumber as string,
        {
          amount: refundAmount,
          reason: 'Order cancellation refund',
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

      return {
        refundId: refund?.id,
        refundedAmount,
      };
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

  const refundConfirmationMessage = await generateRefundProcessedMessage(
    context.state.orderNumber as string,
    customerName,
    context.state.cancellationResult?.refundedAmount,
    REFUND_TIMELINE_BUSINESS_DAYS,
    aiIdentity,
  );

  const refundNotificationResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
      step: 8.1,
      description: 'Send refund completion confirmation',
      actionDetails:
        'Sending a dedicated refund confirmation email with expected processing timeline so customers know when funds should appear.',
      proposedEmailBody: refundConfirmationMessage,
      metadata: {
        orderNumber: context.state.orderNumber,
        refundedAmount: context.state.cancellationResult?.refundedAmount,
        stage: 'refund_completed',
      },
    },
    async (humanResponse) => {
      const messageToSend = humanResponse?.modifiedData?.message ?? refundConfirmationMessage;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        extractEmail(context.email.fromEmail),
        context.email.subject ?? '',
        messageToSend,
        context.email.threadId,
      );
      return { confirmationSent: true };
    },
    context,
  );

  const confirmationFailure = buildOrderCancellationFailureResult(
    context.state,
    refundNotificationResult,
  );
  if (confirmationFailure) {
    return {
      ...confirmationFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: true,
      refundProcessed: true,
      confirmationSent: false,
    };
  }
  confirmationSent = true;

  log.info('Self fulfillment completed successfully', {
    cancellationProcessed,
    refundProcessed,
    confirmationSent,
  });

  return {
    success: true,
    state: context.state,
    fulfillmentMethod,
    cancellationEligible: true,
    cancellationProcessed,
    refundProcessed,
    confirmationSent,
  };
}
