/**
 * Order Cancellation Order Discovery Sub-Workflow
 * Handles Actions 3-3.1: Extract order number and request order info from customer
 */

import { log, proxyActivities, sleep } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { WismoOrderActivities } from '../../../../activities/agents/wismo/wismo-order.activities';
import type { WismoMessageActivities } from '../../../../activities/agents/wismo/wismo-messages.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  OrderCancellationActionType,
} from '../../../../types';
import { OrderDiscoveryResult } from '../order-cancellation.types';
import {
  ACTIVITY_TIMEOUTS,
  CUSTOMER_REPLY_CHECK_INTERVAL,
  MAX_CUSTOMER_REPLY_WAIT_DAYS,
  RETRY_POLICIES,
} from '../order-cancellation.constants';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { extractEmail } from '../order-cancellation.helpers';

// Proxy activities
const wismoOrderActivities = proxyActivities<typeof WismoOrderActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.fetchOrder,
  retry: RETRY_POLICIES.standard,
});

const emailActivities = proxyActivities<typeof EmailActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.sendEmail,
  retry: RETRY_POLICIES.standard,
});

const wismoMessageActivities = proxyActivities<typeof WismoMessageActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.sendEmail,
  retry: RETRY_POLICIES.standard,
});

const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>({
  startToCloseTimeout: ACTIVITY_TIMEOUTS.aiIdentity,
  retry: RETRY_POLICIES.standard,
});

const { extractOrderNumberFromEmail, getMostRecentOrderByEmail } = wismoOrderActivities;
const { sendCustomerNotificationViaGmailThread, checkForCustomerReplyInThread } = emailActivities;
const { generateOrderInfoRequestMessage } = wismoMessageActivities;
const { getAiIdentity } = aiIdentityActivities;

/**
 * Phase 2: Order Discovery Sub-Workflow
 *
 * Actions:
 * 3. Extract order number from email
 * 3.1. If not found, request from customer and wait for reply
 *
 * This phase identifies the order number either from the email content
 * or by interacting with the customer.
 */
export async function handleOrderCancellationOrderDiscovery(
  context: ActionExecutionContext,
): Promise<OrderDiscoveryResult> {
  let orderNumber = '';
  let requiredCustomerInteraction = false;
  let orderFoundInEmail = false;

  try {
    // ==========================================
    // ACTION 3: Extract Order Number
    // ==========================================

    const extractOrderResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.EXTRACT_ORDER_NUMBER,
        step: 3,
        description: 'Extract order number from email or find by customer email',
      },
      async () => {
        const extraction = await extractOrderNumberFromEmail(context.email);

        if (extraction?.orderNumbers?.length) {
          orderNumber = extraction.orderNumbers.toString();
          orderFoundInEmail = true;
          context.state.orderNumber = orderNumber;
          return { orderNumber, source: 'email_content', found: true };
        }

        const customerEmail = extractEmail(context.email.fromEmail);
        if (customerEmail) {
          const recentOrder = await getMostRecentOrderByEmail(context.userId, customerEmail);

          if (recentOrder && recentOrder.number) {
            orderNumber = recentOrder.number;
            orderFoundInEmail = true;
            context.state.orderNumber = orderNumber;

            return { orderNumber, source: 'customer_email_lookup', found: true };
          }
        }

        return { orderNumber: null, source: null, found: false };
      },
      context,
    );

    if (!extractOrderResult.success) {
      if (extractOrderResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: extractOrderResult.escalation.type,
          reason: extractOrderResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          orderNumber,
          requiredCustomerInteraction: false,
          orderFoundInEmail,
          escalation: extractOrderResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        orderNumber,
        requiredCustomerInteraction: false,
        orderFoundInEmail,
      };
    }

    if (orderFoundInEmail) {
      return {
        success: true,
        state: context.state,
        orderNumber,
        requiredCustomerInteraction: false,
        orderFoundInEmail: true,
      };
    }

    // ==========================================
    // ACTION 3.1: Request Order Info from Customer
    // ==========================================

    requiredCustomerInteraction = true;

    const requestOrderInfoResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.REQUEST_ORDER_INFO,
        step: 3.1,
        description: 'Request order information from customer and wait for reply',
        metadata: {
          maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS,
        },
      },
      async () => {
        const aiIdentity = await getAiIdentity(context.email.userId);
        const customerName = extractEmail(context.email.fromEmail)?.split('@')[0] || '';
        const followUpMessage = await generateOrderInfoRequestMessage(
          customerName,
          'order cancellation request',
          aiIdentity,
        );

        const customerEmail = extractEmail(context.email.fromEmail) || context.email.fromEmail;

        await sendCustomerNotificationViaGmailThread(
          context.email.userId,
          customerEmail,
          `Re: ${context.email.subject || ''}`,
          followUpMessage,
          context.email.threadId,
        );

        // Wait for customer reply
        let replyReceived = false;
        let replyCheckCount = 0;
        const maxChecks = (MAX_CUSTOMER_REPLY_WAIT_DAYS * 24 * 60) / 10;
        let lastMessageId = context.email.messageId;

        while (!replyReceived && replyCheckCount < maxChecks) {
          await sleep(CUSTOMER_REPLY_CHECK_INTERVAL);
          replyCheckCount++;

          const replyCheck = await checkForCustomerReplyInThread(
            context.email.userId,
            context.email.threadId,
            lastMessageId,
          );

          if (replyCheck.hasNewReply && replyCheck.newEmail) {
            replyReceived = true;
            lastMessageId = replyCheck.newEmail.messageId;

            const replyEmail = {
              ...context.email,
              messageId: replyCheck.newEmail.messageId,
              fromEmail: replyCheck.newEmail.from,
              subject: replyCheck.newEmail.subject,
              body: replyCheck.newEmail.body,
            };

            context.state.customerReply = replyCheck.newEmail.body;

            const extraction = await extractOrderNumberFromEmail(replyEmail);
            if (extraction?.orderNumbers?.length) {
              orderNumber = extraction.orderNumbers.toString();
              context.state.orderNumber = orderNumber;
              break;
            }

            // Try to find order by email mentioned in reply
            try {
              const emailMatch = replyCheck.newEmail.body.match(
                /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
              );
              const extractedEmail = emailMatch
                ? emailMatch[0]
                : extractEmail(context.email.fromEmail);

              if (extractedEmail) {
                const order = await getMostRecentOrderByEmail(context.email.userId, extractedEmail);
                if (order && order.number) {
                  orderNumber = order.number;
                  context.state.orderNumber = orderNumber;
                }
              }
            } catch (error) {
              log.error('Still could not find order after customer reply', { error });
            }
          }
        }

        if (!replyReceived || !context.state.orderNumber) {
          throw new EscalationError(
            EscalationType.ORDER_NOT_FOUND,
            replyReceived
              ? 'Could not identify order even after customer response'
              : 'Customer did not respond to order information request',
            {
              customerReplied: replyReceived,
              replyCheckCount,
              maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS,
            },
          );
        }

        return {
          customerReplied: replyReceived,
          orderNumber: context.state.orderNumber,
          replyCheckCount,
        };
      },
      context,
    );

    if (!requestOrderInfoResult.success) {
      if (requestOrderInfoResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: requestOrderInfoResult.escalation.type,
          reason: requestOrderInfoResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          orderNumber,
          requiredCustomerInteraction: true,
          orderFoundInEmail,
          escalation: requestOrderInfoResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        orderNumber,
        requiredCustomerInteraction: true,
        orderFoundInEmail,
      };
    }

    orderNumber = context.state.orderNumber || orderNumber;

    return {
      success: true,
      state: context.state,
      orderNumber,
      requiredCustomerInteraction: true,
      orderFoundInEmail: false,
    };
  } catch (error) {
    log.error('Order cancellation order discovery phase failed', { error });
    throw error;
  }
}
