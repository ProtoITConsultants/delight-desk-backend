import { condition, log, proxyActivities } from '@temporalio/workflow';
import type { EmailEntity } from '../../../../../../database/schema';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { OrderActivities } from '../../../../activities/shared/order.activities';
import type { CustomerMessageActivities } from '../../../../activities/shared/customer-message.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import {
  ActionExecutionContext,
  ActionStatus,
  AddressChangeActionType,
  EscalationError,
  EscalationType,
} from '../../../types';
import { executeWorkflowAction, extractCustomerName } from '../../../workflow-action.helpers';
import { ACTIVITY_TIMEOUTS, MAX_CUSTOMER_REPLY_WAIT_DAYS } from '../address-change.constants';
import { extractEmail, formatWooCommerceOrder } from '../address-change.helpers';
import {
  AddressChangeOrderDetection,
  AddressChangeWorkflowState,
  OrderDiscoveryResult,
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
const { extractOrderNumberFromEmail, getMostRecentOrderByEmail } = orderActivities;
const { generateOrderInfoRequestMessage } = messageActivities;
const { getAiIdentity } = aiIdentityActivities;
const EMAIL_IN_TEXT_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

function applyResolvedOrderToState(
  context: ActionExecutionContext<AddressChangeWorkflowState>,
  order: any,
): boolean {
  if (!order || !order.id) {
    return false;
  }

  context.state.orderNumber = order.id?.toString() || order.number?.toString();
  context.state.wooOrder = formatWooCommerceOrder(order);
  return true;
}

async function tryResolveMostRecentOrderByEmail(
  context: ActionExecutionContext<AddressChangeWorkflowState>,
  email: string,
): Promise<boolean> {
  const order = await getMostRecentOrderByEmail(context.email.userId, email);
  return applyResolvedOrderToState(context, order);
}

async function resolveOrderFromCustomerReply(
  context: ActionExecutionContext<AddressChangeWorkflowState>,
  replyEmail: EmailEntity,
): Promise<void> {
  const detection = await extractOrderNumberFromEmail(replyEmail);
  if (detection?.orderNumbers?.length) {
    context.state.orderNumber = detection.orderNumbers.toString();
    return;
  }

  const emailMatch = replyEmail.body?.match(EMAIL_IN_TEXT_REGEX);
  const extractedEmail = emailMatch ? emailMatch[0] : extractEmail(context.email.fromEmail);
  await tryResolveMostRecentOrderByEmail(context, extractedEmail);
}

export async function handleAddressChangeOrderDiscovery(
  context: ActionExecutionContext<AddressChangeWorkflowState>,
): Promise<OrderDiscoveryResult> {
  log.info('Starting Address Change order discovery phase', {
    workflowId: context.workflowId,
    emailId: context.email.id,
  });

  let orderDetection: AddressChangeOrderDetection | undefined;
  let requiredCustomerInteraction = false;
  let customerReplied = false;

  const extractOrderResult = await executeWorkflowAction(
    {
      type: AddressChangeActionType.EXTRACT_ORDER_NUMBER,
      step: 3,
      name: 'Extract order number from email',
      actionDetails:
        "Extracting the order number from the email body using AI parsing, or looking up the customer's most recent order by their email address.",
      skipApproval: true,
    },
    async () => {
      orderDetection = await extractOrderNumberFromEmail(context.email);

      if (!orderDetection?.orderNumbers?.length) {
        try {
          await tryResolveMostRecentOrderByEmail(context, extractEmail(context.email.fromEmail));
        } catch (error) {
          log.error('Most recent order lookup failed, continue to customer follow-up', { error });
        }
      } else {
        context.state.orderNumber = orderDetection.orderNumbers.toString();
      }

      return { orderNumber: context.state.orderNumber, orderDetection };
    },
    context,
  );

  const extractFailure = buildAddressChangeFailureResult(context.state, extractOrderResult);
  if (extractFailure) {
    return {
      ...extractFailure,
      requiredCustomerInteraction: false,
    };
  }

  if (extractOrderResult.result?.orderDetection) {
    orderDetection = extractOrderResult.result.orderDetection;
  }

  if (!context.state.orderNumber) {
    requiredCustomerInteraction = true;
    const aiIdentity = await getAiIdentity(context.email.userId);
    const customerName = extractCustomerName(context.email.fromEmail);
    const followUpMessage = await generateOrderInfoRequestMessage(
      customerName,
      orderDetection?.customerQuery || 'address change inquiry',
      aiIdentity,
    );

    const requestOrderInfoResult = await executeWorkflowAction(
      {
        type: AddressChangeActionType.REQUEST_ORDER_INFO,
        step: 3.1,
        name: 'Request order information from customer and wait for reply',
        actionDetails: `Order number not found in the original email. Sending a follow-up message to ${context.email.fromEmail} requesting their order number, then waiting up to ${MAX_CUSTOMER_REPLY_WAIT_DAYS} days for their reply.`,
        proposedEmailBody: followUpMessage,
        metadata: { maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS },
      },
      async (humanResponse, runtimeControl) => {
        const messageToSend = humanResponse?.modifiedData?.message ?? followUpMessage;

        await sendCustomerNotificationViaThread(
          context.email.userId,
          extractEmail(context.email.fromEmail),
          context.email.subject ?? '',
          messageToSend,
          context.email.threadId,
        );

        context.state.awaitingCustomerReply = true;
        await runtimeControl?.setStatus(ActionStatus.AWAITING_CUSTOMER_REPLY);

        const maxWaitMs = MAX_CUSTOMER_REPLY_WAIT_DAYS * 24 * 60 * 60 * 1000;
        const replyReceived = await condition(() => !!context.state.customerReplyEmail, maxWaitMs);
        context.state.awaitingCustomerReply = false;

        if (replyReceived) {
          await runtimeControl?.setStatus(ActionStatus.EXECUTING);
        }

        if (replyReceived && context.state.customerReplyEmail) {
          const replyEmail = context.state.customerReplyEmail;
          customerReplied = true;
          context.state.latestCustomerMessageBody =
            replyEmail.body || context.state.latestCustomerMessageBody;

          try {
            await resolveOrderFromCustomerReply(context, replyEmail);
          } finally {
            context.state.customerReplyEmail = undefined;
          }
        }

        if (!replyReceived || !context.state.orderNumber) {
          throw new EscalationError(
            EscalationType.ORDER_NOT_FOUND,
            replyReceived
              ? 'Could not identify order even after customer response'
              : 'Customer did not respond to order information request',
            { customerReplied: replyReceived, maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS },
          );
        }

        return { customerReplied: replyReceived, orderNumber: context.state.orderNumber };
      },
      context,
    );

    const requestFailure = buildAddressChangeFailureResult(context.state, requestOrderInfoResult);
    if (requestFailure) {
      return {
        ...requestFailure,
        requiredCustomerInteraction: true,
        customerReplied,
      };
    }
  }

  return {
    success: true,
    state: context.state,
    orderNumber: context.state.orderNumber,
    requiredCustomerInteraction,
    customerReplied,
    orderDetection,
  };
}
