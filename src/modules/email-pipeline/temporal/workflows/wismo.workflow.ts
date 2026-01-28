import {
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
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  HumanResponse,
  OrderDetails,
  WismoActionType,
  WorkFlowInput,
  WorkflowState,
} from '../../types';
import { executeWorkflowAction } from './workflow-action.helpers';

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
  checkForCustomerReplyInThread,
  markEmailAsRead,
} = proxyActivities<typeof EmailActivities.prototype>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '10s',
    maximumAttempts: 3,
  },
});

export const humanResponseSignal = defineSignal<[HumanResponse, string?]>('humanResponse');
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
    actionResponses: {}, // Track responses per action (Temporal-safe workflow state)
    plannedActions: [
      { step: 1, action: 'Mark Email as Read', description: 'Mark incoming email as read' },
      {
        step: 2,
        action: 'Verify AI Confidence',
        description: 'Verify classification confidence threshold',
      },
      {
        step: 3,
        action: 'Extract Order Number',
        description: 'Detect order number from email or find by customer email',
      },
      {
        step: 3.1,
        action: 'Request Order Info (Optional)',
        description: 'Request order info from customer and wait for reply',
      },
      {
        step: 4,
        action: 'Fetch Order Details',
        description: 'Fetch order details from WooCommerce',
      },
      {
        step: 5,
        action: 'Send Acknowledgement',
        description: 'Send acknowledgement email (if moderation enabled)',
      },
      {
        step: 6,
        action: 'Wait for Tracking',
        description: 'Wait for tracking number to become available',
      },
      {
        step: 7,
        action: 'Create AfterShip Tracking',
        description: 'Create tracking in AfterShip',
      },
      {
        step: 8,
        action: 'Monitor Tracking',
        description: 'Monitor tracking status and send updates until delivered',
      },
      {
        step: 9,
        action: 'Send Final Notification',
        description: 'Send delivery confirmation to customer',
      },
    ],
    status: 'processing',
    lastUpdated: new Date(),
  };

  let humanResponse: HumanResponse | null = null;

  // Set up signal handler to route responses to specific actions
  setHandler(humanResponseSignal, (response: HumanResponse, approvalItemId?: string) => {
    humanResponse = response;
    state.humanResponse = response;
    state.lastUpdated = new Date();

    // Store response for specific action in workflow state (Temporal-safe!)
    // This replaces the in-memory Map which was not Temporal-safe
    if (approvalItemId) {
      if (!state.actionResponses) {
        state.actionResponses = {};
      }
      state.actionResponses[approvalItemId] = response;

      log.info('Action response stored in workflow state', {
        approvalItemId,
        decision: response.decision,
      });
    }
  });
  setHandler(stateQuery, () => state);

  // Get agent settings to determine if moderation is required
  const agentSettings = await getUserAgentSettings(email.userId, 'wismo');

  // Create execution context for all actions
  const context: ActionExecutionContext = {
    workflowId: wfInfo.workflowId,
    workflowRunId: wfInfo.runId,
    userId: email.userId,
    email,
    state,
    requiresModeration: agentSettings.requiresModeration || false,
    agentType: 'WISMO Agent',
  };

  try {
    // ==========================================
    // ACTION 1: Mark Incoming Email As Read
    // ==========================================

    const markReadResult = await executeWorkflowAction(
      {
        type: WismoActionType.MARK_EMAIL_READ,
        step: 1,
        description: 'Mark incoming email as read',
      },
      () => markEmailAsRead(email.userId, email.messageId),
      context,
    );

    if (!markReadResult.success) {
      if (markReadResult.escalation) {
        state.status = 'escalated';
        return `Escalated: ${markReadResult.escalation.reason}`;
      }
      state.status = 'cancelled';
      return 'Workflow cancelled - action rejected at step 1';
    }

    // ==========================================
    // ACTION 2: Verify AI Confidence
    // ==========================================

    const confidenceCheckResult = await executeWorkflowAction(
      {
        type: WismoActionType.VERIFY_AI_CONFIDENCE,
        step: 2,
        description: `Verify AI classification confidence (${classification.confidence}%)`,
        metadata: {
          confidence: classification.confidence,
          category: classification.category,
          threshold: CLASSIFICATION_CONFIDENCE_THRESHOLD,
        },
      },
      async () => {
        if (state.classification.confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
          throw new EscalationError(
            EscalationType.LOW_CLASSIFICATION_CONFIDENCE,
            `Classification confidence (${state.classification.confidence}%) below threshold (${CLASSIFICATION_CONFIDENCE_THRESHOLD}%)`,
            {
              confidence: `${classification.confidence}%`,
              category: classification.category,
              threshold: CLASSIFICATION_CONFIDENCE_THRESHOLD,
            },
          );
        }
        return { verified: true, confidence: state.classification.confidence };
      },
      context,
    );

    if (!confidenceCheckResult.success) {
      if (confidenceCheckResult.escalation) {
        state.status = 'escalated';
        state.escalation = {
          type: confidenceCheckResult.escalation.type,
          reason: confidenceCheckResult.escalation.reason,
          timestamp: new Date(),
        };
        return `Escalated: ${confidenceCheckResult.escalation.reason}`;
      }
      state.status = 'cancelled';
      return 'Workflow cancelled - action rejected at step 2';
    }

    // ==========================================
    // ACTION 3: Extract Order Number
    // ==========================================

    let orderDetection: any = null;

    const extractOrderResult = await executeWorkflowAction(
      {
        type: WismoActionType.EXTRACT_ORDER_NUMBER,
        step: 3,
        description: 'Extract order number from email or find by customer email',
      },
      async () => {
        orderDetection = await extractOrderNumberFromEmail(email);

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
            throw new EscalationError(
              EscalationType.ORDER_NOT_FOUND,
              'Could not extract order number from email or find by customer email',
              { customerEmail: email.fromEmail },
            );
          }
        } else {
          // @ts-ignore
          state.orderNumber = orderDetection.orderNumbers.toString();
        }

        return { orderNumber: state.orderNumber, orderDetection };
      },
      context,
    );

    if (!extractOrderResult.success) {
      if (extractOrderResult.escalation) {
        state.status = 'escalated';
        state.escalation = {
          type: extractOrderResult.escalation.type,
          reason: extractOrderResult.escalation.reason,
          timestamp: new Date(),
        };
        return `Escalated: ${extractOrderResult.escalation.reason}`;
      }
      state.status = 'cancelled';
      return 'Workflow cancelled - action rejected at step 3';
    }

    // Update orderDetection from result if we got it
    if (extractOrderResult.result?.orderDetection) {
      orderDetection = extractOrderResult.result.orderDetection;
    }

    // ==========================================
    // ACTION 3.1 (Optional): Request Order Info from Customer
    // ==========================================
    // This action only executes if we couldn't extract order number
    if (!state.orderNumber) {
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
          const customerName = extractEmail(email.fromEmail as string)?.split('@')[0] || '';
          const followUpMessage = await generateOrderInfoRequestMessage(
            customerName,
            orderDetection?.customerQuery || 'order status inquiry',
          );

          // Send follow-up email
          await sendCustomerNotificationViaGmailThread(
            email.userId,
            extractEmail(email.fromEmail) as string,
            `Re: ${email.subject}`,
            followUpMessage,
            email.threadId,
          );

          log.info('Follow-up email sent requesting order information');

          // Wait for customer reply with periodic checks
          let customerReplied = false;
          let replyCheckCount = 0;
          const maxChecks = (MAX_CUSTOMER_REPLY_WAIT_DAYS * 24) / 6;
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

                  const order = await getMostRecentOrderByEmail(
                    email.userId,
                    extractedEmail as string,
                  );
                  state.orderNumber = order['id'].toString() || order['number'].toString();
                  state.wooOrder = formatWooCommerceOrder(order);
                } catch (error) {
                  log.error('Still could not find order after customer reply', { error });
                }
              }
            }
          }

          // If customer didn't reply or still no order, throw escalation
          if (!customerReplied || !state.orderNumber) {
            throw new EscalationError(
              EscalationType.ORDER_NOT_FOUND,
              customerReplied
                ? 'Could not identify order even after customer response'
                : 'Customer did not respond to order information request',
              {
                customerReplied,
                replyCheckCount,
                maxWaitDays: MAX_CUSTOMER_REPLY_WAIT_DAYS,
              },
            );
          }

          return {
            customerReplied,
            orderNumber: state.orderNumber,
            replyCheckCount,
          };
        },
        context,
      );

      if (!requestOrderInfoResult.success) {
        if (requestOrderInfoResult.escalation) {
          state.status = 'escalated';
          state.escalation = {
            type: requestOrderInfoResult.escalation.type,
            reason: requestOrderInfoResult.escalation.reason,
            timestamp: new Date(),
          };
          return `Escalated: ${requestOrderInfoResult.escalation.reason}`;
        }
        state.status = 'cancelled';
        return 'Workflow cancelled - action rejected at request order info step';
      }
    }

    // ==========================================
    // ACTION 4: Fetch Order Details from WooCommerce
    // ==========================================

    if (!state.wooOrder) {
      const fetchOrderResult = await executeWorkflowAction(
        {
          type: WismoActionType.FETCH_ORDER_DETAILS,
          step: 4,
          description: `Fetch order #${state.orderNumber} details from WooCommerce`,
          metadata: {
            orderNumber: state.orderNumber,
          },
        },
        async () => {
          const order = await getWooCommerceOrderById(email.userId, state.orderNumber as string);
          state.wooOrder = formatWooCommerceOrder(order);

          if (!state.wooOrder) {
            throw new EscalationError(
              EscalationType.ORDER_NOT_FOUND,
              'Order not found in WooCommerce',
              {
                orderNumber: state.orderNumber,
                issue: 'Order number provided but not found in system',
              },
            );
          }

          return { wooOrder: state.wooOrder };
        },
        context,
      );

      if (!fetchOrderResult.success) {
        if (fetchOrderResult.escalation) {
          state.status = 'escalated';
          state.escalation = {
            type: fetchOrderResult.escalation.type,
            reason: fetchOrderResult.escalation.reason,
            timestamp: new Date(),
          };
          return `Escalated: ${fetchOrderResult.escalation.reason}`;
        }
        state.status = 'cancelled';
        return 'Workflow cancelled - action rejected at fetch order step';
      }
    }

    // ==========================================
    // ACTION 5: Send Acknowledgement Email
    // ==========================================
    // Only send acknowledgement if moderation is enabled

    if (context.requiresModeration) {
      const sendAckResult = await executeWorkflowAction(
        {
          type: WismoActionType.SEND_ACKNOWLEDGEMENT,
          step: 5,
          description: 'Send acknowledgement email to customer',
          metadata: {
            orderNumber: state.orderNumber,
            customerName: state.wooOrder?.customerInfo?.name,
          },
        },
        async () => {
          const acknowledgementMessage = await generateAcknowledgementMessage(
            state.orderNumber as string,
            state.wooOrder?.customerInfo?.name || 'Customer',
            orderDetection?.customerQuery || 'order status inquiry',
          );

          await sendCustomerNotificationViaGmailThread(
            email.userId,
            extractEmail(email.fromEmail) as string,
            `Re: ${email.subject}`,
            acknowledgementMessage,
            email.threadId,
          );

          return { acknowledgementSent: true };
        },
        context,
      );

      if (!sendAckResult.success) {
        if (sendAckResult.escalation) {
          state.status = 'escalated';
          state.escalation = {
            type: sendAckResult.escalation.type,
            reason: sendAckResult.escalation.reason,
            timestamp: new Date(),
          };
          return `Escalated: ${sendAckResult.escalation.reason}`;
        }
        state.status = 'cancelled';
        return 'Workflow cancelled - action rejected at send acknowledgement step';
      }
    }

    // ==========================================
    // ACTION 6: Wait for Tracking Number (with retry)
    // ==========================================

    const waitForTrackingResult = await executeWorkflowAction(
      {
        type: WismoActionType.WAIT_FOR_TRACKING,
        step: 6,
        description: `Wait for tracking number to become available (up to ${MAX_TRACKING_RETRIES_IN_DAYS} days)`,
        metadata: {
          orderNumber: state.orderNumber,
          maxRetries: MAX_TRACKING_RETRIES_IN_DAYS,
          retryInterval: TRACKING_RETRY_INTERVAL,
        },
      },
      async () => {
        state.trackingRetryCount = 0;

        while (
          state.trackingRetryCount < MAX_TRACKING_RETRIES_IN_DAYS &&
          !state.wooOrder?.trackingNumber
        ) {
          await sleep(TRACKING_RETRY_INTERVAL);
          state.trackingRetryCount++;

          log.info('Checking for tracking number', {
            attempt: state.trackingRetryCount,
            maxRetries: MAX_TRACKING_RETRIES_IN_DAYS,
          });

          // Re-fetch order to check for tracking
          try {
            const order = await getWooCommerceOrderById(email.userId, state.orderNumber as string);
            state.wooOrder = formatWooCommerceOrder(order);
          } catch (error) {
            log.error('Error fetching order during tracking wait', { error });
            // Continue retrying
          }
        }

        // If still no tracking number after all retries, escalate
        if (!state.wooOrder?.trackingNumber) {
          throw new EscalationError(
            EscalationType.TRACKING_RETRY_THRESHOLD_EXCEEDED,
            `Tracking number not available after ${MAX_TRACKING_RETRIES_IN_DAYS} days`,
            {
              orderNumber: state.orderNumber,
              retriesAttempted: state.trackingRetryCount,
              issue: 'Tracking information not yet available after multiple checks',
            },
          );
        }

        return {
          trackingNumber: state.wooOrder.trackingNumber,
          trackingProvider: state.wooOrder.trackingProvider,
          retriesNeeded: state.trackingRetryCount,
        };
      },
      context,
    );

    if (!waitForTrackingResult.success) {
      if (waitForTrackingResult.escalation) {
        state.status = 'escalated';
        state.escalation = {
          type: waitForTrackingResult.escalation.type,
          reason: waitForTrackingResult.escalation.reason,
          timestamp: new Date(),
        };
        return `Escalated: ${waitForTrackingResult.escalation.reason}`;
      }
      state.status = 'cancelled';
      return 'Workflow cancelled - action rejected at wait for tracking step';
    }

    // ==========================================
    // ACTION 7: Create AfterShip Tracking
    // ==========================================

    const createTrackingResult = await executeWorkflowAction(
      {
        type: WismoActionType.CREATE_AFTERSHIP_TRACKING,
        step: 7,
        description: `Create AfterShip tracking for ${state.wooOrder?.trackingNumber}`,
        metadata: {
          trackingNumber: state.wooOrder?.trackingNumber,
          trackingProvider: state.wooOrder?.trackingProvider,
          orderNumber: state.orderNumber,
        },
      },
      async () => {
        state.aftershipTracking = await createAfterShipTracking(
          state.wooOrder!.trackingNumber!,
          state.wooOrder!.trackingProvider!,
          parseInt(state.wooOrder!.orderId, 10),
        );

        return {
          aftershipTracking: state.aftershipTracking,
          trackingId: state.aftershipTracking.id,
        };
      },
      context,
    );

    if (!createTrackingResult.success) {
      if (createTrackingResult.escalation) {
        state.status = 'escalated';
        state.escalation = {
          type: createTrackingResult.escalation.type,
          reason: createTrackingResult.escalation.reason,
          timestamp: new Date(),
        };
        return `Escalated: ${createTrackingResult.escalation.reason}`;
      }
      state.status = 'cancelled';
      return 'Workflow cancelled - action rejected at create tracking step';
    }

    // ==========================================
    // ACTION 8: Monitor Tracking Status (until delivered)
    // ==========================================

    const monitorTrackingResult = await executeWorkflowAction(
      {
        type: WismoActionType.MONITOR_TRACKING_STATUS,
        step: 8,
        description: 'Monitor tracking status and send updates until delivered',
        metadata: {
          trackingNumber: state.aftershipTracking?.tracking_number,
          orderNumber: state.orderNumber,
        },
      },
      async () => {
        let updatesCount = 0;

        while (state.aftershipTracking && state.aftershipTracking.tag !== 'Delivered') {
          await sleep(STATUS_CHECK_INTERVAL);

          // Fetch latest status
          const latestTracking = await fetchAfterShipStatus(state.aftershipTracking.id!);

          // Check if status changed
          if (latestTracking.tag && latestTracking.tag !== state.lastTrackingTag) {
            // Generate notification message
            const notificationMessage = await generateTrackingUpdateNotification(
              state.orderNumber as string,
              latestTracking.tag,
              `https://track.aftership.com/${latestTracking.tracking_number}`,
              state.wooOrder?.customerInfo?.name || 'Customer',
            );

            // Send notification via Gmail thread
            await sendCustomerNotificationViaGmailThread(
              email.userId,
              extractEmail(email.fromEmail) as string,
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
            updatesCount++;
          }

          // Handle exception status - escalate
          if (
            latestTracking.tag === 'Exception' ||
            latestTracking.tag === 'AttemptFail' ||
            latestTracking.tag === 'Expired'
          ) {
            throw new EscalationError(
              EscalationType.AFTERSHIP_EXCEPTION,
              `Shipping exception occurred: ${latestTracking.tag}`,
              {
                trackingStatus: latestTracking.tag,
                trackingNumber: latestTracking.tracking_number,
                orderNumber: state.orderNumber,
                issue: 'Delivery exception occurred',
              },
            );
          }
        }

        return {
          finalStatus: state.aftershipTracking?.tag,
          updatesCount,
          delivered: true,
        };
      },
      context,
    );

    if (!monitorTrackingResult.success) {
      if (monitorTrackingResult.escalation) {
        state.status = 'escalated';
        state.escalation = {
          type: monitorTrackingResult.escalation.type,
          reason: monitorTrackingResult.escalation.reason,
          timestamp: new Date(),
        };
        return `Escalated: ${monitorTrackingResult.escalation.reason}`;
      }
      state.status = 'cancelled';
      return 'Workflow cancelled - action rejected at monitor tracking step';
    }

    // ==========================================
    // ACTION 9: Send Final Delivery Notification
    // ==========================================

    const sendFinalNotificationResult = await executeWorkflowAction(
      {
        type: WismoActionType.SEND_FINAL_NOTIFICATION,
        step: 9,
        description: 'Send final delivery confirmation to customer',
        metadata: {
          orderNumber: state.orderNumber,
          trackingStatus: 'Delivered',
          trackingNumber: state.aftershipTracking?.tracking_number,
        },
        requiresUserData: true, // May need edited message from user
      },
      async () => {
        // Generate the final notification message
        const finalNotification = await generateTrackingUpdateNotification(
          state.orderNumber as string,
          'Delivered',
          `https://track.aftership.com/${state.aftershipTracking?.tracking_number}`,
          state.wooOrder?.customerInfo?.name || 'Customer',
        );

        // If moderation is enabled and user provided modified message, use it
        // Otherwise use the generated message
        const messageToSend =
          context.requiresModeration && humanResponse?.modifiedData?.message
            ? humanResponse.modifiedData.message
            : finalNotification;

        // Send the notification
        await sendCustomerNotificationViaGmailThread(
          email.userId,
          extractEmail(email.fromEmail) as string,
          `Delivery Confirmation - Order #${state.orderNumber}`,
          messageToSend,
          email.threadId,
        );

        return {
          messageSent: true,
          sentAt: new Date(),
          orderNumber: state.orderNumber,
          trackingStatus: 'Delivered',
          wasModified: !!humanResponse?.modifiedData?.message,
        };
      },
      context,
    );

    if (!sendFinalNotificationResult.success) {
      if (sendFinalNotificationResult.escalation) {
        state.status = 'escalated';
        state.escalation = {
          type: sendFinalNotificationResult.escalation.type,
          reason: sendFinalNotificationResult.escalation.reason,
          timestamp: new Date(),
        };
        return `Escalated: ${sendFinalNotificationResult.escalation.reason}`;
      }
      state.status = 'cancelled';
      return `Workflow cancelled - final notification not approved for order [${state.orderNumber}]`;
    }

    // ==========================================
    // Workflow Complete - Mark as Completed
    // ==========================================
    if (state.approvalQueueId) {
      const { updateApprovalQueueStatus: updateStatusActivity } = proxyActivities<
        typeof EmailActivities.prototype
      >({
        startToCloseTimeout: '1 minute',
      });
      await updateStatusActivity(state.approvalQueueId, email.userId, 'completed');
      log.info('Workflow marked as completed');
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
