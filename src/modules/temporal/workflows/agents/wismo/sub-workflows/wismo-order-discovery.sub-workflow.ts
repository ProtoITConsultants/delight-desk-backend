/**
 * WISMO Order Discovery Sub-Workflow
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
  WismoActionType,
} from '../../../../types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { OrderDiscoveryResult } from '../wismo.types';
import {
  ACTIVITY_TIMEOUTS,
  CUSTOMER_REPLY_CHECK_INTERVAL,
  MAX_CUSTOMER_REPLY_WAIT_DAYS,
} from '../wismo.constants';
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

const { sendCustomerNotificationViaGmailThread, checkForCustomerReplyInThread } = emailActivities;
const { extractOrderNumberFromEmail, getMostRecentOrderByEmail } = wismoOrderActivities;
const { generateOrderInfoRequestMessage } = wismoMessageActivities;
const { getAiIdentity } = aiIdentityActivities;

/**
 * Handle order discovery phase: extract order number or request from customer
 */
export async function handleWismoOrderDiscovery(
  context: ActionExecutionContext,
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
        description: 'Extract order number from email or find by customer email',
      },
      async () => {
        orderDetection = await extractOrderNumberFromEmail(context.email);

        if (!orderDetection?.orderNumbers?.length) {
          try {
            const order = await getMostRecentOrderByEmail(
              context.email.userId,
              extractEmail(context.email.fromEmail as string) as string,
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

      // Get AI identity for message personalization
      const aiIdentity = await getAiIdentity(context.email.userId);

      const requestOrderInfoResult = await executeWorkflowAction(
        {
          type: WismoActionType.REQUEST_ORDER_INFO,
          step: 3.1,
          description: 'Request order information from customer and wait for reply',
          metadata: {
            maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS,
          },
        },
        async () => {
          const customerName = extractEmail(context.email.fromEmail as string)?.split('@')[0] || '';
          const followUpMessage = await generateOrderInfoRequestMessage(
            customerName,
            orderDetection?.customerQuery || 'order status inquiry',
            aiIdentity,
          );

          // Send follow-up email
          await sendCustomerNotificationViaGmailThread(
            context.email.userId,
            extractEmail(context.email.fromEmail) as string,
            `Re: ${context.email.subject}`,
            followUpMessage,
            context.email.threadId,
          );

          log.info('Follow-up email sent requesting order information');

          // Wait for customer reply with periodic checks
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
              customerReplied = true;
              lastMessageId = replyCheck.newEmail.messageId;

              log.info('Customer replied with order information', {
                messageId: replyCheck.newEmail.messageId,
              });

              // Try to extract order information from the reply
              const replyEmail = {
                ...context.email,
                messageId: replyCheck.newEmail.messageId,
                fromEmail: replyCheck.newEmail.from,
                subject: replyCheck.newEmail.subject,
                body: replyCheck.newEmail.body,
              };

              orderDetection = await extractOrderNumberFromEmail(replyEmail);

              if (orderDetection?.orderNumbers?.length) {
                context.state.orderNumber = orderDetection.orderNumbers.toString();
              } else {
                // Try to find order by email mentioned in reply
                try {
                  const emailMatch = replyCheck.newEmail.body.match(
                    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
                  );
                  const extractedEmail = emailMatch
                    ? emailMatch[0]
                    : extractEmail(context.email.fromEmail as string);

                  const order = await getMostRecentOrderByEmail(
                    context.email.userId,
                    extractedEmail as string,
                  );
                  context.state.orderNumber = order['id'].toString() || order['number'].toString();
                  context.state.wooOrder = formatWooCommerceOrder(order);
                } catch (error) {
                  log.error('Still could not find order after customer reply', { error });
                }
              }
            }
          }

          // If customer didn't reply or still no order, throw escalation
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
