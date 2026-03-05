/**
 * WISMO Order Discovery Sub-Workflow
 * Handles Actions 3-3.1: Extract order number and request order info from customer
 */

import { condition, log, proxyActivities } from '@temporalio/workflow';

import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { WismoOrderActivities } from '../../../../activities/agents/wismo/wismo-order.activities';
import type { WismoMessageActivities } from '../../../../activities/agents/wismo/wismo-messages.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import {
  ActionStatus,
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  WismoActionType,
} from '../../../types';
import { executeWorkflowAction, extractCustomerName } from '../../../workflow-action.helpers';
import { OrderDiscoveryResult, WismoWorkflowState } from '../wismo.types';
import { ACTIVITY_TIMEOUTS, MAX_CUSTOMER_REPLY_WAIT_DAYS } from '../wismo.constants';
import { extractEmail, formatWooCommerceOrder } from '../wismo.helpers';

// Proxy activities
const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const wismoOrderActivities = proxyActivities<typeof WismoOrderActivities.prototype>(
  ACTIVITY_TIMEOUTS.WISMO_ORDER,
);
const wismoMessageActivities = proxyActivities<typeof WismoMessageActivities.prototype>(
  ACTIVITY_TIMEOUTS.WISMO_MESSAGE,
);
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);

const { sendCustomerNotificationViaThread } = emailActivities;
const { extractOrderNumberFromEmail, getMostRecentOrderByEmail } = wismoOrderActivities;
const { generateOrderInfoRequestMessage } = wismoMessageActivities;
const { getAiIdentity } = aiIdentityActivities;

/**
 * Handle order discovery phase: extract order number or request from customer
 */
export async function handleWismoOrderDiscovery(
  context: ActionExecutionContext<WismoWorkflowState>,
): Promise<OrderDiscoveryResult> {
  log.info('Starting WISMO order discovery phase', {
    workflowId: context.workflowId,
    emailId: context.email.id,
  });

  let orderDetection: any = null;
  let requiredCustomerInteraction = false;
  let customerReplied = false;

  try {
    // ==========================================
    // ACTION 3: Extract Order Number
    // ==========================================

    const extractOrderResult = await executeWorkflowAction(
      {
        type: WismoActionType.EXTRACT_ORDER_NUMBER,
        step: 3,
        description: 'Extract order number from email',
        actionDetails: `Extracting the order number from the email body using AI parsing, or looking up the customer's most recent order by their email address.`,
      },
      async () => {
        orderDetection = await extractOrderNumberFromEmail(context.email);

        if (!orderDetection?.orderNumbers?.length) {
          try {
            const order = await getMostRecentOrderByEmail(
              context.email.userId,
              extractEmail(context.email.fromEmail),
            );

            // Check if order exists before accessing properties
            if (order && order.id) {
              context.state.orderNumber = order['id'].toString() || order['number'].toString();
              context.state.wooOrder = formatWooCommerceOrder(order);
            } else {
              // No order found - don't escalate, let Action 3.1 handle follow-up
              log.info(
                'No order found - will proceed to Action 3.1 to request order info from customer',
              );
            }
          } catch (error) {
            // Error fetching order - don't escalate, let Action 3.1 handle follow-up
            log.error('Most Recent Order Error - will proceed to Action 3.1', { error });
          }
        } else {
          context.state.orderNumber = orderDetection.orderNumbers.toString();
        }

        return { orderNumber: context.state.orderNumber, orderDetection };
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
          requiredCustomerInteraction: false,
          escalation: extractOrderResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        requiredCustomerInteraction: false,
      };
    }

    // Update orderDetection from result if we got it
    if (extractOrderResult.result?.orderDetection) {
      orderDetection = extractOrderResult.result.orderDetection;
    }

    // ==========================================
    // ACTION 3.1 (Optional): Request Order Info from Customer
    // ==========================================
    // This action only executes if we couldn't extract order number
    if (!context.state.orderNumber) {
      requiredCustomerInteraction = true;

      // Get AI identity and pre-generate follow-up message so it can be shown in the UI
      const aiIdentity = await getAiIdentity(context.email.userId);
      const customerName = extractCustomerName(context.email.fromEmail);
      const followUpMessage = await generateOrderInfoRequestMessage(
        customerName,
        orderDetection?.customerQuery || 'order status inquiry',
        aiIdentity,
      );

      const requestOrderInfoResult = await executeWorkflowAction(
        {
          type: WismoActionType.REQUEST_ORDER_INFO,
          step: 3.1,
          description: 'Request order information from customer and wait for reply',
          actionDetails: `Order number not found in the original email. Sending a follow-up message to ${context.email.fromEmail} requesting their order number, then waiting up to ${MAX_CUSTOMER_REPLY_WAIT_DAYS} days for their reply.`,
          proposedEmailBody: followUpMessage,
          metadata: {
            maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS,
          },
        },
        async (humanResponse, runtimeControl) => {
          const messageToSend = humanResponse?.modifiedData?.message ?? followUpMessage;

          // Send follow-up email
          await sendCustomerNotificationViaThread(
            context.email.userId,
            extractEmail(context.email.fromEmail),
            context.email.subject ?? '',
            messageToSend,
            context.email.threadId,
          );

          log.info(
            'Follow-up email sent requesting order information - waiting for customer reply via signal',
          );

          // Park the workflow until InfraService delivers the customer's reply via
          // customerReplySignal (triggered in real-time by the incoming webhook).
          context.state.awaitingCustomerReply = true;
          await runtimeControl?.setStatus(ActionStatus.AWAITING_CUSTOMER_REPLY);
          const maxWaitMs = MAX_CUSTOMER_REPLY_WAIT_DAYS * 24 * 60 * 60 * 1000;
          const replyReceived = await condition(
            () => !!context.state.customerReplyEmail,
            maxWaitMs,
          );
          context.state.awaitingCustomerReply = false;

          if (replyReceived) {
            await runtimeControl?.setStatus(ActionStatus.EXECUTING);
          }

          if (replyReceived && context.state.customerReplyEmail) {
            const replyEmail = context.state.customerReplyEmail;
            customerReplied = true;

            log.info('Customer replied with order information', {
              messageId: replyEmail.messageId,
            });

            orderDetection = await extractOrderNumberFromEmail(replyEmail);

            if (orderDetection?.orderNumbers?.length) {
              context.state.orderNumber = orderDetection.orderNumbers.toString();
            } else {
              // Try to find order by email address mentioned in the reply body
              try {
                const emailMatch = replyEmail.body?.match(
                  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
                );
                const extractedEmail = emailMatch
                  ? emailMatch[0]
                  : extractEmail(context.email.fromEmail);

                const order = await getMostRecentOrderByEmail(context.email.userId, extractedEmail);
                context.state.orderNumber = order['id'].toString() || order['number'].toString();
                context.state.wooOrder = formatWooCommerceOrder(order);
              } catch (error) {
                log.error('Still could not find order after customer reply', { error });
              }
            }
          }

          // If timed out or still no order found, escalate
          if (!replyReceived || !context.state.orderNumber) {
            throw new EscalationError(
              EscalationType.ORDER_NOT_FOUND,
              replyReceived
                ? 'Could not identify order even after customer response'
                : 'Customer did not respond to order information request',
              {
                customerReplied: replyReceived,
                maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS,
              },
            );
          }

          return {
            customerReplied: replyReceived,
            orderNumber: context.state.orderNumber,
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
            requiredCustomerInteraction: true,
            customerReplied,
            escalation: requestOrderInfoResult.escalation,
          };
        }
        context.state.status = 'cancelled';
        return {
          success: false,
          state: context.state,
          requiredCustomerInteraction: true,
          customerReplied,
        };
      }
    }

    log.info('WISMO order discovery phase completed successfully', {
      orderNumber: context.state.orderNumber,
      requiredCustomerInteraction,
      customerReplied,
    });

    return {
      success: true,
      state: context.state,
      orderNumber: context.state.orderNumber,
      requiredCustomerInteraction,
      customerReplied,
      orderDetection,
    };
  } catch (error) {
    log.error('WISMO order discovery phase failed', { error });
    throw error;
  }
}
