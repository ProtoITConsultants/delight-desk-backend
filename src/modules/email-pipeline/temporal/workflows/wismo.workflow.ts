import {
  condition,
  defineQuery,
  defineSignal,
  log,
  proxyActivities,
  setHandler,
  sleep,
  workflowInfo,
} from '@temporalio/workflow';
import type { EmailActivities } from '../activities/email.activities';
import {
  EscalationType,
  HumanDecision,
  HumanResponse,
  OrderDetails,
  WorkFlowInput,
  WorkflowState,
} from '../../types';

const {
  extractOrderNumberFromEmail,
  getMostRecentOrderByEmail,
  getWooCommerceOrderById,
  createAfterShipTracking,
  fetchAfterShipStatus,
  sendCustomerNotificationViaGmailThread,
  getUserAgentSettings,
  generateAcknowledgementMessage,
  generateOrderInfoRequestMessage,
  generateTrackingUpdateNotification,
  generateEscalationResponse,
  checkForCustomerReplyInThread,
  createEscalation,
  createApprovalQueueItem,
  markApprovalQueueItemExecuted,
  markEmailAsRead,
} = proxyActivities<typeof EmailActivities.prototype>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '10s',
    maximumAttempts: 3,
  },
});

export const humanResponseSignal = defineSignal<[HumanResponse]>('humanResponse');
export const stateQuery = defineQuery<WorkflowState>('state');

const CLASSIFICATION_CONFIDENCE_THRESHOLD = 70;
const MAX_TRACKING_RETRIES_IN_DAYS = 7;
const TRACKING_RETRY_INTERVAL = '2 hours';
const STATUS_CHECK_INTERVAL = '2 hours';
const CUSTOMER_REPLY_CHECK_INTERVAL = '6 hours';
const MAX_CUSTOMER_REPLY_WAIT_DAYS = 3;

export async function handleWismo(wfInput: WorkFlowInput): Promise<string> {
  const wfInfo = workflowInfo();
  const { email, classification } = wfInput;

  let state: WorkflowState = {
    email,
    classification,
    trackingRetryCount: 0,
    escalation: {},
    humanResponse: {},
    plannedActions: [
      {
        step: 1,
        action: 'Send Status Update',
        description: 'Email customer with order status and tracking info',
      },
    ],
    status: 'processing',
    lastUpdated: new Date(),
  };

  let humanResponse: HumanResponse | null = null;

  setHandler(humanResponseSignal, (response: HumanResponse) => {
    humanResponse = response;
    state.humanResponse = response;
    state.lastUpdated = new Date();
  });
  setHandler(stateQuery, () => state);

  try {
    // ==========================================
    // STEP 1: Mark Incoming Email As Read
    // ==========================================

    await markEmailAsRead(email.userId, email.messageId);

    // ==========================================
    // STEP 1.1: Verify Ai Confidence
    // ==========================================

    if (state.classification.confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
      state.status = 'escalated';

      state.escalation = {
        type: EscalationType.LOW_CLASSIFICATION_CONFIDENCE,
        reason: 'Escalated due to low classification confidence',
        timestamp: new Date(),
      };

      const customerName = extractEmail(email.fromEmail as string)?.split('@')[0] || '';

      // Generate AI response, reason, and confidence in one call
      const {
        response: aiResponse,
        confidence: aiConfidence,
        reason: escalationReason,
      } = await generateEscalationResponse(
        'Low Classification Confidence',
        email.body,
        customerName,
        undefined,
        {
          confidence: `${classification.confidence}%`,
          category: classification.category,
        },
      );

      await createEscalation({
        workflowId: wfInfo.workflowId,
        threadId: email.threadId,
        userId: email.userId,
        reason: escalationReason,
        email: email,
        aiSuggestedResponse: aiResponse,
        aiSuggestedResponseConfidence: aiConfidence.toString(),
        priority: classification.priority,
      });

      return `Escalated due to low classification confidence`;
    }

    // ==========================================
    // STEP 2: Order Number Detection
    // ==========================================

    let orderDetection = await extractOrderNumberFromEmail(email);

    if (!orderDetection?.orderNumbers?.length) {
      try {
        const order = await getMostRecentOrderByEmail(
          email.userId,
          extractEmail(email.fromEmail as string) as string,
        );
        state.orderNumber = order['id'].toString() || order['number'].toString();
        state.wooOrder = formatWooCommerceOrder(order);
      } catch (error) {
        log.error('Most Recent Order Error', { error });
      }
    } else {
      // @ts-ignore
      state.orderNumber = orderDetection.orderNumbers.toString();
    }

    // ==========================================
    // STEP 3: WooCommerce Order Lookup
    // ==========================================

    // If we don't have order info, request it from customer
    if (!state.orderNumber) {
      // Send follow-up email asking for order information
      const customerName = extractEmail(email.fromEmail as string)?.split('@')[0] || '';
      const followUpMessage = await generateOrderInfoRequestMessage(
        customerName,
        orderDetection?.customerQuery || 'order status inquiry',
      );

      await sendCustomerNotificationViaGmailThread(
        email.userId,
        // @ts-ignore
        extractEmail(email.fromEmail),
        `Re: ${email.subject}`,
        followUpMessage,
        email.threadId,
      );

      log.info('Follow-up email sent requesting order information');

      // Wait for customer reply with periodic checks
      let customerReplied = false;
      let replyCheckCount = 0;
      const maxChecks = (MAX_CUSTOMER_REPLY_WAIT_DAYS * 24) / 6; // Check every 6 hours for 3 days
      let lastMessageId = email.messageId;

      while (!customerReplied && replyCheckCount < maxChecks) {
        await sleep(CUSTOMER_REPLY_CHECK_INTERVAL);
        replyCheckCount++;

        const replyCheck = await checkForCustomerReplyInThread(
          email.userId,
          email.threadId,
          lastMessageId,
        );

        if (replyCheck.hasNewReply && replyCheck.newEmail) {
          customerReplied = true;
          lastMessageId = replyCheck.newEmail.messageId;

          log.info('Customer replied with order information', {
            messageId: replyCheck.newEmail.messageId,
          });

          // Try to extract order information from the reply
          const replyEmail = {
            ...email,
            messageId: replyCheck.newEmail.messageId,
            fromEmail: replyCheck.newEmail.from,
            subject: replyCheck.newEmail.subject,
            body: replyCheck.newEmail.body,
          };

          orderDetection = await extractOrderNumberFromEmail(replyEmail);

          if (orderDetection?.orderNumbers?.length) {
            // @ts-ignore
            state.orderNumber = orderDetection.orderNumbers.toString();
          } else {
            // Try to find order by email mentioned in reply
            try {
              const emailMatch = replyCheck.newEmail.body.match(
                /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
              );
              const extractedEmail = emailMatch
                ? emailMatch[0]
                : extractEmail(email.fromEmail as string);

              const order = await getMostRecentOrderByEmail(email.userId, extractedEmail as string);
              state.orderNumber = order['id'].toString() || order['number'].toString();
              state.wooOrder = formatWooCommerceOrder(order);
            } catch (error) {
              log.error('Still could not find order after customer reply', { error });
            }
          }
        }
      }

      // If customer didn't reply, or we still can't find the order, escalate
      if (!customerReplied || !state.orderNumber) {
        state.status = 'escalated';
        state.escalation = {
          type: EscalationType.ORDER_NOT_FOUND,
          reason: customerReplied
            ? 'Could not identify order even after customer response'
            : 'Customer did not respond to order information request',
          timestamp: new Date(),
        };

        // Generate AI response, reason, and confidence in one call
        const customerName = extractEmail(email.fromEmail as string)?.split('@')[0] || '';
        const {
          response: aiResponse,
          confidence: aiConfidence,
          reason: escalationReason,
        } = await generateEscalationResponse(
          'Order Not Found',
          orderDetection?.customerQuery || 'order status inquiry',
          customerName,
          undefined,
          {
            'Customer replied': customerReplied ? 'Yes' : 'No',
            'Attempts to reach customer': replyCheckCount,
          },
        );

        // Create escalation record
        await createEscalation({
          workflowId: wfInfo.workflowId,
          threadId: email.threadId,
          userId: email.userId,
          reason: escalationReason,
          email: email,
          aiSuggestedResponse: aiResponse,
          aiSuggestedResponseConfidence: aiConfidence.toString(),
          priority: classification.priority,
        });

        return `Escalated: ${state.escalation.reason}`;
      }
    }

    // Fetch order details if we have order number but not full order data
    try {
      if (!state.wooOrder) {
        const order = await getWooCommerceOrderById(email.userId, state.orderNumber as string);
        state.wooOrder = formatWooCommerceOrder(order);
      }
    } catch (error) {
      state.status = 'escalated';
      state.escalation = {
        type: EscalationType.ORDER_NOT_FOUND,
        reason: 'Escalated due to order not found in WooCommerce',
        timestamp: new Date(),
      };

      // Generate AI response, reason, and confidence in one call
      const customerName = extractEmail(email.fromEmail as string)?.split('@')[0] || '';
      const {
        response: aiResponse,
        confidence: aiConfidence,
        reason: escalationReason,
      } = await generateEscalationResponse(
        'Order Not Found in WooCommerce',
        orderDetection?.customerQuery || 'order status inquiry',
        customerName,
        state.orderNumber,
        {
          Issue: 'Order number provided but not found in system',
        },
      );

      // Create escalation record
      await createEscalation({
        workflowId: wfInfo.workflowId,
        threadId: email.threadId,
        userId: email.userId,
        reason: escalationReason,
        email: email,
        aiSuggestedResponse: aiResponse,
        aiSuggestedResponseConfidence: aiConfidence.toString(),
        priority: classification.priority,
      });

      return `Escalated due to order not found in WooCommerce`;
    }

    // ==========================================
    // STEP 3.5: Send Acknowledgement Email
    // ==========================================

    const agentSettings = await getUserAgentSettings(email.userId, 'wismo');

    if (agentSettings.requiresModeration) {
      // Generate and send acknowledgement to let customer know we received their inquiry
      const acknowledgementMessage = await generateAcknowledgementMessage(
        state.orderNumber as string,
        // @ts-ignore
        state.wooOrder.customerInfo.name,
        orderDetection?.customerQuery || 'order status inquiry',
      );

      await sendCustomerNotificationViaGmailThread(
        email.userId,
        // @ts-ignore
        extractEmail(email.fromEmail),
        `Re: ${email.subject}`,
        acknowledgementMessage,
        email.threadId,
      );
    }

    // ==========================================
    // STEP 4: Wait for Tracking (with retry)
    // ==========================================

    while (
      // @ts-ignore
      state.trackingRetryCount < MAX_TRACKING_RETRIES_IN_DAYS &&
      // @ts-ignore
      !state.wooOrder.trackingNumber
    ) {
      await sleep(TRACKING_RETRY_INTERVAL);
      // @ts-ignore
      state.trackingRetryCount++;

      // Re-fetch order to check for tracking
      try {
        const order = await getWooCommerceOrderById(email.userId, state.orderNumber as string);
        state.wooOrder = formatWooCommerceOrder(order);
      } catch (error) {
        // Continue retrying
      }
    }

    // Escalate if max retries exceeded
    // @ts-ignore
    if (!state.wooOrder.trackingNumber) {
      state.status = 'escalated';
      state.escalation = {
        type: EscalationType.TRACKING_RETRY_THRESHOLD_EXCEEDED,
        reason: 'Escalated due to tracking retry limit reached',
        timestamp: new Date(),
      };

      // Generate AI response, reason, and confidence in one call
      const customerName = extractEmail(email.fromEmail as string)?.split('@')[0] || '';
      const {
        response: aiResponse,
        confidence: aiConfidence,
        reason: escalationReason,
      } = await generateEscalationResponse(
        'Tracking Number Not Available',
        orderDetection?.customerQuery || 'order status inquiry',
        customerName,
        state.orderNumber,
        {
          Issue: 'Tracking information not yet available after multiple checks',
          'Days waited': MAX_TRACKING_RETRIES_IN_DAYS,
        },
      );

      // Create escalation record
      await createEscalation({
        workflowId: wfInfo.workflowId,
        threadId: email.threadId,
        userId: email.userId,
        reason: escalationReason,
        email: email,
        aiSuggestedResponse: aiResponse,
        aiSuggestedResponseConfidence: aiConfidence.toString(),
        priority: classification.priority,
      });

      return `Escalated due to tracking retry limit reached`;
    }

    // ==========================================
    // STEP 5: Create AfterShip Tracking
    // ==========================================
    state.aftershipTracking = await createAfterShipTracking(
      // @ts-ignore
      state.wooOrder.trackingNumber,
      // @ts-ignore
      state.wooOrder.trackingProvider,
      // @ts-ignore
      state.wooOrder.orderId,
    );

    // ==========================================
    // STEP 6 & 7: Monitor Tracking Status
    // ==========================================

    // @ts-ignore
    while (state.aftershipTracking.tag !== 'Delivered') {
      await sleep(STATUS_CHECK_INTERVAL);
      // Fetch latest status
      // @ts-ignore
      const latestTracking = await fetchAfterShipStatus(state.aftershipTracking.id);

      // Check if status changed
      if (latestTracking.tag !== state.lastTrackingTag) {
        // Generate notification message
        const notificationMessage = await generateTrackingUpdateNotification(
          state.orderNumber as string,
          latestTracking.tag,
          `https://track.aftership.com/${latestTracking.tracking_number}`,
          // @ts-ignore
          state.wooOrder.customerInfo.name,
        );

        // Send notification via Gmail thread
        await sendCustomerNotificationViaGmailThread(
          email.userId,
          // @ts-ignore
          extractEmail(email.fromEmail),
          `Shipping Update - Order #${state.orderNumber}`,
          notificationMessage,
          email.threadId,
        );

        log.info('Tracking status changed - notification sent', {
          oldStatus: state.lastTrackingTag,
          newStatus: latestTracking.tag,
        });

        state.lastTrackingTag = latestTracking.tag;
        state.aftershipTracking = latestTracking;
      }

      // Handle exception status
      if (
        latestTracking.tag === 'Exception' ||
        latestTracking.tag === 'AttemptFail' ||
        latestTracking.tag === 'Expired'
      ) {
        state.status = 'escalated';
        state.escalation = {
          type: EscalationType.AFTERSHIP_EXCEPTION,
          reason: 'Escalated due to aftership exception.',
          timestamp: new Date(),
        };

        // Generate AI response, reason, and confidence in one call
        // @ts-ignore
        const customerName =
          state.wooOrder?.customerInfo?.name ||
          extractEmail(email.fromEmail as string)?.split('@')[0] ||
          '';
        const {
          response: aiResponse,
          confidence: aiConfidence,
          reason: escalationReason,
        } = await generateEscalationResponse(
          'Shipping Exception',
          orderDetection?.customerQuery || 'order status inquiry',
          customerName,
          state.orderNumber,
          {
            'Tracking status': latestTracking.tag,
            'Tracking number': latestTracking.tracking_number,
            Issue: 'Delivery exception occurred',
          },
        );

        // Create escalation record
        await createEscalation({
          workflowId: wfInfo.workflowId,
          threadId: email.threadId,
          userId: email.userId,
          reason: escalationReason,
          email: email,
          aiSuggestedResponse: aiResponse,
          aiSuggestedResponseConfidence: aiConfidence.toString(),
          priority: classification.priority,
        });

        return `Escalated due to aftership exception.`;
      }
    }

    // ==========================================
    // STEP 8: Check Moderation & Send Final Notification
    // ==========================================

    // Check if moderation is required for this agent
    if (agentSettings.requiresModeration) {
      // Send to approval queue
      state.status = 'awaiting_human';
      state.escalation = {
        type: EscalationType.MANUAL_ESCALATION,
        reason: 'Manual approval required before sending final delivery notification',
        timestamp: new Date(),
      };

      // Generate the final notification message for approval
      const finalNotification = await generateTrackingUpdateNotification(
        state.orderNumber as string,
        'Delivered',
        // @ts-ignore
        `https://track.aftership.com/${state.aftershipTracking.tracking_number}`,
        // @ts-ignore
        state.wooOrder.customerInfo.name,
      );

      // Create approval queue item
      const approvalItem = await createApprovalQueueItem({
        userId: email.userId,
        emailId: email.id,
        threadId: email.threadId,
        workflowId: wfInfo.workflowId,
        workflowRunId: wfInfo.runId,

        agentType: 'WISMO Agent',
        emailSubject: email.subject,
        customerEmail: email.fromEmail,
        emailDate: email.internalDate,
        emailBody: email.body,
        proposedResponse: finalNotification,
        plannedSteps: [
          {
            step: 1,
            action: 'Send Status Update',
            description: 'Email customer with order status and tracking info',
          },
        ],

        workflowMetadata: {
          orderNumber: state.orderNumber,
          orderDetails: state.wooOrder,
          trackingStatus: 'Delivered',
          trackingNumber: state.aftershipTracking?.tracking_number,
          trackingUrl: `https://track.aftership.com/${state.aftershipTracking?.tracking_number}`,
        },
      });

      state.approvalQueueId = approvalItem.id;

      log.info('Created approval queue item for final notification', {
        approvalQueueId: approvalItem.id,
        orderNumber: state.orderNumber,
      });

      // Wait for human response (up to 7 days)
      const receivedResponse = await condition(() => humanResponse !== null, '7 days');

      if (!receivedResponse || !humanResponse) {
        state.status = 'cancelled';
        return `Workflow cancelled - no response received for order [${state.orderNumber}]`;
      }

      // TypeScript type narrowing: at this point humanResponse is guaranteed to be non-null
      const response = humanResponse as HumanResponse;

      if (!response.decision || response.decision === HumanDecision.REJECT) {
        state.status = 'cancelled';
        return `Workflow cancelled - final notification not approved for order [${state.orderNumber}]`;
      }

      // Use approved/modified message
      const approvedMessage = response.modifiedData?.message || finalNotification;

      await sendCustomerNotificationViaGmailThread(
        email.userId,
        // @ts-ignore
        extractEmail(email.fromEmail),
        `Delivery Confirmation - Order #${state.orderNumber}`,
        approvedMessage,
        email.threadId,
      );

      // Mark approval queue item as executed
      if (state.approvalQueueId) {
        await markApprovalQueueItemExecuted(state.approvalQueueId, email.userId, {
          messageSent: true,
          sentAt: new Date(),
          orderNumber: state.orderNumber,
          trackingStatus: 'Delivered',
        });
      }

      log.info('Approved notification sent and marked as executed', {
        approvalQueueId: state.approvalQueueId,
        orderNumber: state.orderNumber,
      });
    } else {
      // Send final delivery notification directly
      const finalNotification = await generateTrackingUpdateNotification(
        state.orderNumber as string,
        'Delivered',
        // @ts-ignore
        `https://track.aftership.com/${state.aftershipTracking.tracking_number}`,
        // @ts-ignore
        state.wooOrder.customerInfo.name,
      );

      await sendCustomerNotificationViaGmailThread(
        email.userId,
        // @ts-ignore
        extractEmail(email.fromEmail),
        `Delivery Confirmation - Order #${state.orderNumber}`,
        finalNotification,
        email.threadId,
      );
    }

    state.status = 'completed';
    return `WISMO workflow completed successfully for order [${state.orderNumber}]`;
  } catch (error) {
    state.status = 'failed';
    throw error;
  }
}

export function formatWooCommerceOrder(order: any): OrderDetails {
  return {
    orderId: order.id.toString(),
    status: order.status,
    trackingNumber: order.meta_data?.find((m: any) => m.key === '_wc_shipment_tracking_items')
      ?.value[0]['tracking_number'],
    trackingProvider: order.meta_data?.find((m: any) => m.key === '_wc_shipment_tracking_items')
      ?.value[0]['tracking_provider'],
    customerInfo: {
      name: `${order.billing.first_name} ${order.billing.last_name}`,
      email: order.billing.email,
    },
    items: order.line_items.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      total: item.total,
    })),
  };
}

export function extractEmail(fromEmail: string) {
  const match = fromEmail.match(/<([^>]+)>/);
  return match ? match[1] : null;
}
