/**
 * WISMO Order Processing Sub-Workflow
 * Handles Actions 4-5: Fetch order details and send acknowledgement
 */

import { log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { WismoOrderActivities } from '../../../../activities/agents/wismo/wismo-order.activities';
import type { WismoMessageActivities } from '../../../../activities/agents/wismo/wismo-messages.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  WismoActionType,
} from '../../../types';
import { executeWorkflowAction, extractCustomerName } from '../../../workflow-action.helpers';
import { OrderProcessingResult, WismoWorkflowState } from '../wismo.types';
import { ACTIVITY_TIMEOUTS } from '../wismo.constants';
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
const { getWooCommerceOrderById } = wismoOrderActivities;
const { generateAcknowledgementMessage } = wismoMessageActivities;
const { getAiIdentity } = aiIdentityActivities;

/**
 * Handle order processing phase: fetch order details and send acknowledgement
 * Requires orderDetection to be passed for acknowledgement message context
 */
export async function handleWismoOrderProcessing(
  context: ActionExecutionContext<WismoWorkflowState>,
  orderDetection?: any,
): Promise<OrderProcessingResult> {
  log.info('Starting WISMO order processing phase', {
    workflowId: context.workflowId,
    orderNumber: context.state.orderNumber,
  });

  let orderFetched = false;
  let acknowledgementSent = false;

  try {
    // ==========================================
    // ACTION 4: Fetch Order Details from WooCommerce
    // ==========================================

    if (!context.state.wooOrder) {
      const fetchOrderResult = await executeWorkflowAction(
        {
          type: WismoActionType.FETCH_ORDER_DETAILS,
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
                issue: 'Order number provided but not found in system',
              },
            );
          }

          return { wooOrder: context.state.wooOrder };
        },
        context,
      );

      if (!fetchOrderResult.success) {
        if (fetchOrderResult.escalation) {
          context.state.status = 'escalated';
          context.state.escalation = {
            type: fetchOrderResult.escalation.type,
            reason: fetchOrderResult.escalation.reason,
            timestamp: new Date(),
          };
          return {
            success: false,
            state: context.state,
            orderFetched: false,
            acknowledgementSent: false,
            escalation: fetchOrderResult.escalation,
          };
        }
        context.state.status = 'cancelled';
        return {
          success: false,
          state: context.state,
          orderFetched: false,
          acknowledgementSent: false,
        };
      }

      orderFetched = true;
    } else {
      orderFetched = true; // Order was already fetched in discovery phase
      log.info('Order already fetched in discovery phase, skipping fetch');
    }

    // ==========================================
    // ACTION 4.1: Validate Order Status
    // ==========================================
    // Check if order status requires escalation (cancelled, refunded, failed)

    const problematicStatuses = ['cancelled', 'refunded', 'failed'];
    const orderStatus = context.state.wooOrder?.status?.toLowerCase();

    if (orderStatus && problematicStatuses.includes(orderStatus)) {
      // Get AI identity for message personalization
      const aiIdentity = await getAiIdentity(context.email.userId);

      // Pre-generate the status notification message so it can be shown in the UI
      const statusMessage = `Thank you for contacting us regarding order #${context.state.orderNumber}.

We've checked your order and found that it is currently marked as "${orderStatus}". Due to this status, we cannot provide tracking information at this time.

${aiIdentity?.signature || 'Best regards,\nCustomer Support Team'}`;

      const statusValidationResult = await executeWorkflowAction(
        {
          type: WismoActionType.SEND_ACKNOWLEDGEMENT, // Reusing existing type
          step: 4.1,
          description: `Order status is ${orderStatus} - notifying customer and escalating`,
          actionDetails: `Order #${context.state.orderNumber} has a problematic status (${orderStatus}) that prevents tracking. Sending a notification email to the customer explaining the situation, then escalating for manual review. Input: Order number, order status. Output: Customer notified, workflow escalated.`,
          proposedEmailBody: statusMessage,
          metadata: {
            orderNumber: context.state.orderNumber,
            orderStatus: orderStatus,
            reason: 'Order cannot be processed due to status',
          },
        },
        async (humanResponse) => {
          const messageToSend = humanResponse?.modifiedData?.message ?? statusMessage;

          // Send email to customer
          await sendCustomerNotificationViaThread(
            context.email.userId,
            extractEmail(context.email.fromEmail),
            context.email.subject ?? '',
            messageToSend,
            context.email.threadId,
          );

          log.info('Customer notified about problematic order status', {
            orderNumber: context.state.orderNumber,
            status: orderStatus,
          });

          // Escalate to AI assistant for manual handling
          throw new EscalationError(
            EscalationType.MANUAL_ESCALATION,
            `Order status is ${orderStatus} - requires manual intervention`,
            {
              orderNumber: context.state.orderNumber,
              orderStatus: orderStatus,
              issue: `Order cannot proceed with tracking due to ${orderStatus} status`,
              customerNotified: true,
            },
          );
        },
        context,
      );

      // If we reach here, escalation occurred
      if (!statusValidationResult.success || statusValidationResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: statusValidationResult.escalation?.type || EscalationType.MANUAL_ESCALATION,
          reason:
            statusValidationResult.escalation?.reason ||
            `Order status is ${orderStatus} - requires manual intervention`,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          orderFetched: true,
          acknowledgementSent: true, // We sent the status notification
          escalation: statusValidationResult.escalation,
        };
      }
    }

    // ==========================================
    // ACTION 5: Send Acknowledgement Email
    // ==========================================
    // Only send acknowledgement if moderation is enabled

    if (context.requiresModeration) {
      // Get AI identity for message personalization
      const aiIdentity = await getAiIdentity(context.email.userId);

      // Pre-generate the acknowledgement message so it can be shown in the UI before approval
      const customerName = extractCustomerName(context.email.fromEmail);

      const acknowledgementMessage = await generateAcknowledgementMessage(
        context.state.orderNumber as string,
        customerName,
        orderDetection?.customerQuery || 'order status inquiry',
        aiIdentity,
      );

      const sendAckResult = await executeWorkflowAction(
        {
          type: WismoActionType.SEND_ACKNOWLEDGEMENT,
          step: 5,
          description: 'Send acknowledgement email to customer',
          actionDetails: `Sending an AI-generated acknowledgement email to ${extractEmail(context.email.fromEmail)} confirming receipt of their order status inquiry for order #${context.state.orderNumber}. The proposed message can be reviewed and edited before sending. Input: Order number, customer name. Output: Acknowledgement email sent.`,
          proposedEmailBody: acknowledgementMessage,
          metadata: {
            orderNumber: context.state.orderNumber,
            customerName,
          },
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

      if (!sendAckResult.success) {
        if (sendAckResult.escalation) {
          context.state.status = 'escalated';
          context.state.escalation = {
            type: sendAckResult.escalation.type,
            reason: sendAckResult.escalation.reason,
            timestamp: new Date(),
          };
          return {
            success: false,
            state: context.state,
            orderFetched: true,
            acknowledgementSent: false,
            escalation: sendAckResult.escalation,
          };
        }
        context.state.status = 'cancelled';
        return {
          success: false,
          state: context.state,
          orderFetched: true,
          acknowledgementSent: false,
        };
      }

      acknowledgementSent = true;
    } else {
      log.info('Moderation disabled, skipping acknowledgement email');
    }

    log.info('WISMO order processing phase completed successfully', {
      orderFetched,
      acknowledgementSent,
    });

    return {
      success: true,
      state: context.state,
      orderFetched,
      acknowledgementSent,
    };
  } catch (error) {
    log.error('WISMO order processing phase failed', { error });
    throw error;
  }
}
