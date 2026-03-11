import { condition, log, proxyActivities } from '@temporalio/workflow';
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
  CANCELLATION_STANDARD_WINDOW_HOURS,
  CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS,
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

const NON_CANCELLABLE_STATUSES = new Set(['completed', 'shipped', 'delivered']);

function extractPlainEmailAddress(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.match(/<([^>]+)>/);
  return (match ? match[1] : email).trim().toLowerCase();
}

function isOutsideStandardCancellationWindow(orderCreatedAt: Date, now: Date): boolean {
  const diffMs = now.getTime() - orderCreatedAt.getTime();
  const windowMs = CANCELLATION_STANDARD_WINDOW_HOURS * 60 * 60 * 1000;
  return diffMs > windowMs;
}

/**
 * Friday 12 PM+ orders remain eligible until Monday 12 PM.
 */
function isWithinWeekendExtension(orderCreatedAt: Date, now: Date): boolean {
  const createdDay = orderCreatedAt.getUTCDay();
  const createdHour = orderCreatedAt.getUTCHours();
  if (createdDay !== 5 || createdHour < 12) {
    return false;
  }

  const mondayNoon = new Date(orderCreatedAt);
  const daysUntilMonday = (8 - createdDay) % 7;
  mondayNoon.setUTCDate(orderCreatedAt.getUTCDate() + daysUntilMonday);
  mondayNoon.setUTCHours(12, 0, 0, 0);

  return now.getTime() <= mondayNoon.getTime();
}

function parseWarehouseResponse(
  body: string | null | undefined,
): 'canceled' | 'cannot_cancel' | 'unknown' {
  const normalized = (body || '').toLowerCase();
  if (normalized.includes('cannot cancel')) return 'cannot_cancel';
  if (
    normalized.includes('cancelled') ||
    normalized.includes('canceled') ||
    normalized.includes('cancellation done')
  ) {
    return 'canceled';
  }
  return 'unknown';
}

export async function handleCustomWarehouseFulfillmentMethod(
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

  const { sendCustomerNotificationViaThread, sendStandaloneEmail } = emailActivities;
  const { getAiIdentity } = aiIdentityActivities;
  const { getWooCommerceOrderById } = orderActivities;
  const {
    getWarehouseEmail,
    updateWooCommerceOrderStatus,
    processWooCommerceRefund,
    generateCustomWarehouseAcknowledgementMessage,
    generateCustomWarehouseCannotCancelMessage,
    generateCustomWarehouseTooLateMessage,
    generateCustomWarehouseRequestEmail,
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

  const orderStatus = (latestOrder?.status || '').toLowerCase();
  const orderCreatedAt = latestOrder?.date_created
    ? new Date(latestOrder.date_created)
    : latestOrder?.date_created_gmt
      ? new Date(latestOrder.date_created_gmt)
      : null;
  const customerEmailFromOrder = extractPlainEmailAddress(latestOrder?.billing?.email);
  const senderEmail = extractPlainEmailAddress(context.email.fromEmail);
  let warehouseEmail: string | null = null;

  const validateCustomerEmailResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.VALIDATE_CUSTOMER_EMAIL,
      step: 6.0,
      description: 'Validate customer email matches order records',
      actionDetails:
        'Confirming request sender email matches WooCommerce billing email before any warehouse coordination.',
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

  if (NON_CANCELLABLE_STATUSES.has(orderStatus)) {
    const cannotCancelMessage = await generateCustomWarehouseCannotCancelMessage(
      context.state.orderNumber as string,
      orderStatus,
      customerName,
      aiIdentity,
    );

    const cannotCancelResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
        step: 6.1,
        description: 'Send cannot-cancel response to customer',
        actionDetails:
          'Order status indicates cancellation is too late. Sending customer guidance and return next-step info.',
        proposedEmailBody: cannotCancelMessage,
        metadata: {
          orderStatus,
          orderNumber: context.state.orderNumber,
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

  const validateTimeWindowResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.CHECK_TIME_ELIGIBILITY,
      step: 6.05,
      description: 'Validate custom warehouse cancellation time window',
      actionDetails:
        'Checking 24-hour cancellation window with Friday-noon weekend extension policy for custom warehouse automation.',
      metadata: {
        orderNumber: context.state.orderNumber,
        orderCreatedAt: orderCreatedAt?.toISOString(),
      },
    },
    async () => {
      if (orderCreatedAt) {
        const now = new Date();
        const outside24h = isOutsideStandardCancellationWindow(orderCreatedAt, now);
        const weekendExtension = isWithinWeekendExtension(orderCreatedAt, now);
        if (outside24h && !weekendExtension) {
          throw new EscalationError(
            EscalationType.MANUAL_ESCALATION,
            'Order is outside custom warehouse automated cancellation window',
            {
              orderNumber: context.state.orderNumber,
              orderCreatedAt: orderCreatedAt.toISOString(),
              now: now.toISOString(),
              standardWindowHours: CANCELLATION_STANDARD_WINDOW_HOURS,
            },
          );
        }
      }
      return { eligibleWindow: true };
    },
    context,
  );
  const validateTimeWindowFailure = buildOrderCancellationFailureResult(
    context.state,
    validateTimeWindowResult,
  );
  if (validateTimeWindowFailure) {
    return {
      ...validateTimeWindowFailure,
      fulfillmentMethod,
      cancellationEligible: false,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const warehouseConfigResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.CONTACT_WAREHOUSE,
      step: 6.06,
      description: 'Load custom warehouse configuration',
      actionDetails:
        'Loading configured warehouse email for this user before contacting warehouse team.',
      metadata: {
        orderNumber: context.state.orderNumber,
      },
    },
    async () => {
      warehouseEmail = await getWarehouseEmail(context.userId);
      if (!warehouseEmail) {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          'Warehouse email is not configured for custom warehouse fulfillment',
          {
            orderNumber: context.state.orderNumber,
          },
        );
      }
      context.state.warehouseEmail = warehouseEmail;
      return { warehouseEmail };
    },
    context,
  );
  const warehouseConfigFailure = buildOrderCancellationFailureResult(
    context.state,
    warehouseConfigResult,
  );
  if (warehouseConfigFailure) {
    return {
      ...warehouseConfigFailure,
      fulfillmentMethod,
      cancellationEligible: false,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  if (!warehouseEmail) {
    return {
      success: false,
      state: context.state,
      fulfillmentMethod,
      cancellationEligible: false,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }
  const resolvedWarehouseEmail = warehouseEmail;

  const checkingWithWarehouseMessage = await generateCustomWarehouseAcknowledgementMessage(
    context.state.orderNumber as string,
    customerName,
    aiIdentity,
  );

  const customerAckResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.SEND_ACKNOWLEDGEMENT,
      step: 6.2,
      description:
        'Acknowledge cancellation request and notify customer warehouse check is in progress',
      actionDetails:
        'Sending customer acknowledgement that we are coordinating with warehouse before final cancellation decision.',
      proposedEmailBody: checkingWithWarehouseMessage,
      metadata: {
        orderNumber: context.state.orderNumber,
        warehouseEmail: resolvedWarehouseEmail,
      },
    },
    async (humanResponse) => {
      const messageToSend = humanResponse?.modifiedData?.message ?? checkingWithWarehouseMessage;
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
  const customerAckFailure = buildOrderCancellationFailureResult(context.state, customerAckResult);
  if (customerAckFailure) {
    return {
      ...customerAckFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const warehouseEmailContent = await generateCustomWarehouseRequestEmail(
    context.state.orderNumber as string,
    context.workflowId,
  );
  const warehouseSubject = warehouseEmailContent.subject;
  const warehouseMessage = warehouseEmailContent.body;

  const warehouseContactResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.CONTACT_WAREHOUSE,
      step: 6.3,
      description: 'Send urgent cancellation request to warehouse team',
      actionDetails:
        'Sending urgent standalone email to custom warehouse and awaiting explicit confirmation response.',
      proposedEmailBody: warehouseMessage,
      metadata: {
        orderNumber: context.state.orderNumber,
        warehouseEmail: resolvedWarehouseEmail,
      },
    },
    async () => {
      await sendStandaloneEmail(
        context.userId,
        resolvedWarehouseEmail,
        warehouseSubject,
        warehouseMessage,
      );
      return { sent: true };
    },
    context,
  );
  const warehouseContactFailure = buildOrderCancellationFailureResult(
    context.state,
    warehouseContactResult,
  );
  if (warehouseContactFailure) {
    return {
      ...warehouseContactFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const warehouseWaitResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.WAIT_FOR_WAREHOUSE_REPLY,
      step: 6.4,
      description: `Wait up to ${CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS} hours for warehouse response`,
      actionDetails:
        'Waiting for warehouse email response and parsing response keywords to determine cancellation outcome.',
      metadata: {
        timeoutHours: CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS,
        warehouseEmail: resolvedWarehouseEmail,
      },
    },
    async () => {
      const timeoutMs = CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS * 60 * 60 * 1000;
      const deadline = Date.now() + timeoutMs;
      context.state.awaitingWarehouseReply = true;
      context.state.warehouseReplyEmail = undefined;

      while (Date.now() < deadline) {
        const remaining = Math.max(deadline - Date.now(), 0);
        if (remaining === 0) break;
        const received = await condition(() => !!context.state.warehouseReplyEmail, remaining);
        if (!received) break;

        const reply = context.state.warehouseReplyEmail as any;
        context.state.warehouseReplyEmail = undefined;
        const replyFrom = extractPlainEmailAddress(reply?.fromEmail);
        if (!replyFrom || replyFrom !== extractPlainEmailAddress(resolvedWarehouseEmail)) {
          log.info('Ignoring non-warehouse response while waiting for warehouse', { replyFrom });
          continue;
        }

        const parsed = parseWarehouseResponse(reply?.body);
        if (parsed === 'unknown') {
          log.info('Warehouse response did not include actionable keyword; continuing wait', {
            messageId: reply?.messageId,
          });
          continue;
        }

        context.state.awaitingWarehouseReply = false;
        return { outcome: parsed };
      }

      context.state.awaitingWarehouseReply = false;
      throw new EscalationError(
        EscalationType.WAREHOUSE_TIMEOUT,
        `No warehouse response within ${CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS} hours`,
        {
          orderNumber: context.state.orderNumber,
          warehouseEmail: resolvedWarehouseEmail,
          timeoutHours: CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS,
        },
      );
    },
    context,
  );

  const warehouseWaitFailure = buildOrderCancellationFailureResult(
    context.state,
    warehouseWaitResult,
  );
  if (warehouseWaitFailure) {
    return {
      ...warehouseWaitFailure,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: false,
    };
  }

  const outcome = warehouseWaitResult.result?.outcome as 'canceled' | 'cannot_cancel' | undefined;
  if (outcome === 'cannot_cancel') {
    const tooLateMessage = await generateCustomWarehouseTooLateMessage(
      context.state.orderNumber as string,
      customerName,
      aiIdentity,
    );

    const tooLateResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.SEND_FINAL_NOTIFICATION,
        step: 6.5,
        description: 'Send too-late cancellation response with return guidance',
        actionDetails:
          'Warehouse confirmed cancellation is not possible. Sending customer final guidance with return instructions.',
        proposedEmailBody: tooLateMessage,
        metadata: {
          orderNumber: context.state.orderNumber,
          warehouseOutcome: 'cannot_cancel',
        },
      },
      async (humanResponse) => {
        const messageToSend = humanResponse?.modifiedData?.message ?? tooLateMessage;
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
    const tooLateFailure = buildOrderCancellationFailureResult(context.state, tooLateResult);
    if (tooLateFailure) {
      return {
        ...tooLateFailure,
        fulfillmentMethod,
        cancellationEligible: true,
        cancellationProcessed: false,
        refundProcessed: false,
        confirmationSent: false,
      };
    }

    return {
      success: true,
      state: context.state,
      fulfillmentMethod,
      cancellationEligible: true,
      cancellationProcessed: false,
      refundProcessed: false,
      confirmationSent: true,
    };
  }

  const cancellationResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_CANCELLATION,
      step: 7,
      description: `Update order #${context.state.orderNumber} status to cancelled`,
      actionDetails:
        'Marking order as cancelled in WooCommerce after warehouse confirmation to prevent fulfillment.',
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

  const refundResult = await executeWorkflowAction(
    {
      type: OrderCancellationActionType.PROCESS_REFUND,
      step: 8,
      description: `Process refund for order #${context.state.orderNumber}`,
      actionDetails:
        'Processing full WooCommerce refund after warehouse cancellation confirmation.',
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
          reason: 'Custom warehouse cancellation refund',
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
        'Sending final successful cancellation and refund confirmation after warehouse coordination.',
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
