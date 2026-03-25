import { log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { OrderActivities } from '../../../../activities/shared/order.activities';
import type { CustomerMessageActivities } from '../../../../activities/shared/customer-message.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import {
  ActionExecutionContext,
  AddressChangeActionType,
  EscalationError,
  EscalationType,
} from '../../../types';
import { executeWorkflowAction, extractCustomerName } from '../../../workflow-action.helpers';
import { ACTIVITY_TIMEOUTS } from '../address-change.constants';
import { extractEmail, formatWooCommerceOrder } from '../address-change.helpers';
import {
  AddressChangeOrderDetection,
  AddressChangeWorkflowState,
  OrderProcessingResult,
} from '../address-change.types';
import { buildAddressChangeFailureResult } from './address-change-subworkflow.helpers';

const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const orderActivities = proxyActivities<typeof OrderActivities.prototype>(ACTIVITY_TIMEOUTS.ORDER);
const messageActivities = proxyActivities<typeof CustomerMessageActivities.prototype>(
  ACTIVITY_TIMEOUTS.MESSAGE,
);
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);

const { sendCustomerNotificationViaThread } = emailActivities;
const { getWooCommerceOrderById } = orderActivities;
const { generateAcknowledgementMessage } = messageActivities;
const { getAiIdentity } = aiIdentityActivities;

const NON_EDITABLE_ORDER_STATUSES = new Set(['completed', 'cancelled', 'refunded', 'failed']);

export async function handleAddressChangeOrderProcessing(
  context: ActionExecutionContext<AddressChangeWorkflowState>,
  orderDetection?: AddressChangeOrderDetection,
): Promise<OrderProcessingResult> {
  log.info('Starting Address Change order processing phase', {
    workflowId: context.workflowId,
    orderNumber: context.state.orderNumber,
  });

  let orderFetched = false;
  let acknowledgementSent = false;
  let aiIdentityCache: Awaited<ReturnType<typeof getAiIdentity>> | null = null;

  const getCachedAiIdentity = async () => {
    if (!aiIdentityCache) {
      aiIdentityCache = await getAiIdentity(context.email.userId);
    }
    return aiIdentityCache;
  };

  if (!context.state.wooOrder) {
    const fetchOrderResult = await executeWorkflowAction(
      {
        type: AddressChangeActionType.FETCH_ORDER_DETAILS,
        step: 4,
        description: `Fetch order #${context.state.orderNumber} details from WooCommerce`,
        actionDetails: `Fetching full order details from WooCommerce for order #${context.state.orderNumber}.`,
        metadata: {
          orderNumber: context.state.orderNumber,
        },
      },
      async () => {
        const order = await getWooCommerceOrderById(
          context.userId,
          context.state.orderNumber as string,
        );
        context.state.wooOrder = formatWooCommerceOrder(order);

        if (!context.state.wooOrder) {
          throw new EscalationError(
            EscalationType.ORDER_NOT_FOUND,
            'Order not found in WooCommerce',
            {
              orderNumber: context.state.orderNumber,
            },
          );
        }

        return { wooOrder: context.state.wooOrder };
      },
      context,
    );

    const fetchFailure = buildAddressChangeFailureResult(context.state, fetchOrderResult);
    if (fetchFailure) {
      return {
        ...fetchFailure,
        orderFetched: false,
        acknowledgementSent: false,
      };
    }

    orderFetched = true;
  } else {
    orderFetched = true;
  }

  const orderStatus = context.state.wooOrder?.status?.toLowerCase();
  if (orderStatus && NON_EDITABLE_ORDER_STATUSES.has(orderStatus)) {
    const statusValidationResult = await executeWorkflowAction(
      {
        type: AddressChangeActionType.VALIDATE_ORDER_STATUS,
        step: 4.1,
        description: `Order status is ${orderStatus} - requires manual handling`,
        actionDetails:
          'Order status indicates this address change can no longer be completed automatically.',
        metadata: {
          orderNumber: context.state.orderNumber,
          orderStatus,
        },
      },
      async () => {
        throw new EscalationError(
          EscalationType.ORDER_ALREADY_PROCESSED,
          `Order status is ${orderStatus}; automatic address change is no longer supported`,
          { orderNumber: context.state.orderNumber, orderStatus },
        );
      },
      context,
    );
    const statusValidationFailure = buildAddressChangeFailureResult(
      context.state,
      statusValidationResult,
    );
    if (statusValidationFailure) {
      return {
        ...statusValidationFailure,
        orderFetched: true,
        acknowledgementSent: false,
      };
    }
  }

  if (context.requiresModeration) {
    const aiIdentity = await getCachedAiIdentity();
    const customerName = extractCustomerName(context.email.fromEmail);
    const acknowledgementMessage = await generateAcknowledgementMessage(
      context.state.orderNumber as string,
      customerName,
      orderDetection?.customerQuery || 'address change inquiry',
      aiIdentity,
    );

    const sendAckResult = await executeWorkflowAction(
      {
        type: AddressChangeActionType.SEND_ACKNOWLEDGEMENT,
        step: 5,
        description: 'Send acknowledgement email to customer',
        actionDetails: `Sending an acknowledgement email to ${extractEmail(context.email.fromEmail)} confirming receipt of their address-change request for order #${context.state.orderNumber}.`,
        proposedEmailBody: acknowledgementMessage,
      },
      async (humanResponse) => {
        const messageToSend = humanResponse?.modifiedData?.message ?? acknowledgementMessage;
        await sendCustomerNotificationViaThread(
          context.email.userId,
          extractEmail(context.email.fromEmail),
          context.email.subject ?? '',
          messageToSend,
          context.email.threadId,
        );
        return { acknowledgementSent: true };
      },
      context,
    );

    const sendAckFailure = buildAddressChangeFailureResult(context.state, sendAckResult);
    if (sendAckFailure) {
      return {
        ...sendAckFailure,
        orderFetched: true,
        acknowledgementSent: false,
      };
    }

    acknowledgementSent = true;
  }

  return {
    success: true,
    state: context.state,
    orderFetched,
    acknowledgementSent,
  };
}
