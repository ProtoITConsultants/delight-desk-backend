/**
 * WISMO Tracking Sub-Workflow
 * Handles Actions 6-9: Wait for tracking, create tracking, monitor status, send final notification
 */

import { log, proxyActivities, sleep } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { WismoOrderActivities } from '../../../../activities/agents/wismo/wismo-order.activities';
import type { WismoTrackingActivities } from '../../../../activities/agents/wismo/wismo-tracking.activities';
import type { WismoMessageActivities } from '../../../../activities/agents/wismo/wismo-messages.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  HumanResponse,
  WismoActionType,
} from '../../../../types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { TrackingResult } from '../wismo.types';
import {
  ACTIVITY_TIMEOUTS,
  MAX_TRACKING_RETRIES_IN_DAYS,
  STATUS_CHECK_INTERVAL,
  TRACKING_RETRY_INTERVAL,
} from '../wismo.constants';
import { extractEmail, formatWooCommerceOrder } from '../wismo.helpers';

// Proxy activities
const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const wismoOrderActivities = proxyActivities<typeof WismoOrderActivities.prototype>(
  ACTIVITY_TIMEOUTS.WISMO_ORDER,
);
const wismoTrackingActivities = proxyActivities<typeof WismoTrackingActivities.prototype>(
  ACTIVITY_TIMEOUTS.WISMO_TRACKING,
);
const wismoMessageActivities = proxyActivities<typeof WismoMessageActivities.prototype>(
  ACTIVITY_TIMEOUTS.WISMO_MESSAGE,
);
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);

const { sendCustomerNotificationViaGmailThread } = emailActivities;
const { getWooCommerceOrderById } = wismoOrderActivities;
const { createAfterShipTracking, fetchAfterShipStatus } = wismoTrackingActivities;
const { generateTrackingUpdateNotification } = wismoMessageActivities;
const { getAiIdentity } = aiIdentityActivities;

/**
 * Handle tracking phase: wait for tracking, create tracking, monitor status, send final notification
 * This is the longest-running phase, potentially spanning weeks
 */
export async function handleWismoTracking(
  context: ActionExecutionContext,
  humanResponse: HumanResponse | null,
): Promise<TrackingResult> {
  log.info('Starting WISMO tracking phase', {
    workflowId: context.workflowId,
    orderNumber: context.state.orderNumber,
  });

  let updatesCount = 0;
  let finalNotificationSent = false;

  try {
    // Get AI identity for message personalization
    const aiIdentity = await getAiIdentity(context.email.userId);

    // ==========================================
    // ACTION 6: Wait for Tracking Number (with retry)
    // ==========================================

    const waitForTrackingResult = await executeWorkflowAction(
      {
        type: WismoActionType.WAIT_FOR_TRACKING,
        step: 6,
        description: `Wait for tracking number to become available (up to ${MAX_TRACKING_RETRIES_IN_DAYS} days)`,
        metadata: {
          orderNumber: context.state.orderNumber,
          maxRetries: MAX_TRACKING_RETRIES_IN_DAYS,
          retryInterval: TRACKING_RETRY_INTERVAL,
        },
      },
      async () => {
        context.state.trackingRetryCount = 0;

        while (
          context.state.trackingRetryCount < MAX_TRACKING_RETRIES_IN_DAYS &&
          !context.state.wooOrder?.trackingNumber
        ) {
          await sleep(TRACKING_RETRY_INTERVAL);
          context.state.trackingRetryCount++;

          log.info('Checking for tracking number', {
            attempt: context.state.trackingRetryCount,
            maxRetries: MAX_TRACKING_RETRIES_IN_DAYS,
          });

          // Re-fetch order to check for tracking
          try {
            const order = await getWooCommerceOrderById(
              context.email.userId,
              context.state.orderNumber as string,
            );
            context.state.wooOrder = formatWooCommerceOrder(order);
          } catch (error) {
            log.error('Error fetching order during tracking wait', { error });
            // Continue retrying
          }
        }

        // If still no tracking number after all retries, escalate
        if (!context.state.wooOrder?.trackingNumber) {
          throw new EscalationError(
            EscalationType.TRACKING_RETRY_THRESHOLD_EXCEEDED,
            `Tracking number not available after ${MAX_TRACKING_RETRIES_IN_DAYS} days`,
            {
              orderNumber: context.state.orderNumber,
              retriesAttempted: context.state.trackingRetryCount,
              issue: 'Tracking information not yet available after multiple checks',
            },
          );
        }

        return {
          trackingNumber: context.state.wooOrder.trackingNumber,
          trackingProvider: context.state.wooOrder.trackingProvider,
          retriesNeeded: context.state.trackingRetryCount,
        };
      },
      context,
    );

    if (!waitForTrackingResult.success) {
      if (waitForTrackingResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: waitForTrackingResult.escalation.type,
          reason: waitForTrackingResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          delivered: false,
          updatesCount: 0,
          finalNotificationSent: false,
          escalation: waitForTrackingResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        delivered: false,
        updatesCount: 0,
        finalNotificationSent: false,
      };
    }

    // ==========================================
    // ACTION 7: Create AfterShip Tracking
    // ==========================================

    const createTrackingResult = await executeWorkflowAction(
      {
        type: WismoActionType.CREATE_AFTERSHIP_TRACKING,
        step: 7,
        description: `Create AfterShip tracking for ${context.state.wooOrder?.trackingNumber}`,
        metadata: {
          trackingNumber: context.state.wooOrder?.trackingNumber,
          trackingProvider: context.state.wooOrder?.trackingProvider,
          orderNumber: context.state.orderNumber,
        },
      },
      async () => {
        context.state.aftershipTracking = await createAfterShipTracking(
          context.state.wooOrder!.trackingNumber!,
          context.state.wooOrder!.trackingProvider!,
          parseInt(context.state.wooOrder!.orderId, 10),
        );

        return {
          aftershipTracking: context.state.aftershipTracking,
          trackingId: context.state.aftershipTracking.id,
        };
      },
      context,
    );

    if (!createTrackingResult.success) {
      if (createTrackingResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: createTrackingResult.escalation.type,
          reason: createTrackingResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          trackingNumber: context.state.wooOrder?.trackingNumber,
          trackingProvider: context.state.wooOrder?.trackingProvider,
          delivered: false,
          updatesCount: 0,
          finalNotificationSent: false,
          escalation: createTrackingResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        trackingNumber: context.state.wooOrder?.trackingNumber,
        trackingProvider: context.state.wooOrder?.trackingProvider,
        delivered: false,
        updatesCount: 0,
        finalNotificationSent: false,
      };
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
          trackingNumber: context.state.aftershipTracking?.tracking_number,
          orderNumber: context.state.orderNumber,
        },
      },
      async () => {
        while (
          context.state.aftershipTracking &&
          context.state.aftershipTracking.tag !== 'Delivered'
        ) {
          await sleep(STATUS_CHECK_INTERVAL);

          // Fetch latest status
          const latestTracking = await fetchAfterShipStatus(context.state.aftershipTracking.id!);

          // Check if status changed
          if (latestTracking.tag && latestTracking.tag !== context.state.lastTrackingTag) {
            // Use courier-specific tracking link, fallback to tracking number only if not available
            const trackingLink =
              latestTracking.courier_tracking_link ||
              latestTracking.tracking_number ||
              'Not available';

            // Generate notification message
            const notificationMessage = await generateTrackingUpdateNotification(
              context.state.orderNumber as string,
              latestTracking.tag,
              trackingLink,
              context.state.wooOrder?.customerInfo?.name || 'Customer',
              aiIdentity,
              context.state.wooOrder,
              context.state.aftershipTracking,
            );

            // Send notification via Gmail thread
            await sendCustomerNotificationViaGmailThread(
              context.email.userId,
              extractEmail(context.email.fromEmail) as string,
              `Shipping Update - Order #${context.state.orderNumber}`,
              notificationMessage,
              context.email.threadId,
            );

            log.info('Tracking status changed - notification sent', {
              oldStatus: context.state.lastTrackingTag,
              newStatus: latestTracking.tag,
            });

            context.state.lastTrackingTag = latestTracking.tag;
            context.state.aftershipTracking = latestTracking;
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
                orderNumber: context.state.orderNumber,
                issue: 'Delivery exception occurred',
              },
            );
          }
        }

        return {
          finalStatus: context.state.aftershipTracking?.tag,
          updatesCount,
          delivered: true,
        };
      },
      context,
    );

    if (!monitorTrackingResult.success) {
      if (monitorTrackingResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: monitorTrackingResult.escalation.type,
          reason: monitorTrackingResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          trackingNumber: context.state.wooOrder?.trackingNumber,
          trackingProvider: context.state.wooOrder?.trackingProvider,
          delivered: false,
          updatesCount,
          finalNotificationSent: false,
          escalation: monitorTrackingResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        trackingNumber: context.state.wooOrder?.trackingNumber,
        trackingProvider: context.state.wooOrder?.trackingProvider,
        delivered: false,
        updatesCount,
        finalNotificationSent: false,
      };
    }

    // Update updatesCount from monitoring result
    if (monitorTrackingResult.result?.updatesCount) {
      updatesCount = monitorTrackingResult.result.updatesCount;
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
          orderNumber: context.state.orderNumber,
          trackingStatus: 'Delivered',
          trackingNumber: context.state.aftershipTracking?.tracking_number,
        },
        requiresUserData: true, // May need edited message from user
      },
      async () => {
        // Use courier-specific tracking link for final notification
        const trackingLink =
          context.state.aftershipTracking?.courier_tracking_link ||
          context.state.aftershipTracking?.tracking_number ||
          'Not available';

        // Generate the final notification message
        const finalNotification = await generateTrackingUpdateNotification(
          context.state.orderNumber as string,
          'Delivered',
          trackingLink,
          context.state.wooOrder?.customerInfo?.name || 'Customer',
          aiIdentity,
          context.state.wooOrder,
          context.state.aftershipTracking,
        );

        // If moderation is enabled and user provided modified message, use it
        // Otherwise use the generated message
        const messageToSend =
          context.requiresModeration && humanResponse?.modifiedData?.message
            ? humanResponse.modifiedData.message
            : finalNotification;

        // Send the notification
        await sendCustomerNotificationViaGmailThread(
          context.email.userId,
          extractEmail(context.email.fromEmail) as string,
          `Delivery Confirmation - Order #${context.state.orderNumber}`,
          messageToSend,
          context.email.threadId,
        );

        return {
          messageSent: true,
          sentAt: new Date(),
          orderNumber: context.state.orderNumber,
          trackingStatus: 'Delivered',
          wasModified: !!humanResponse?.modifiedData?.message,
        };
      },
      context,
    );

    if (!sendFinalNotificationResult.success) {
      if (sendFinalNotificationResult.escalation) {
        context.state.status = 'escalated';
        context.state.escalation = {
          type: sendFinalNotificationResult.escalation.type,
          reason: sendFinalNotificationResult.escalation.reason,
          timestamp: new Date(),
        };
        return {
          success: false,
          state: context.state,
          trackingNumber: context.state.wooOrder?.trackingNumber,
          trackingProvider: context.state.wooOrder?.trackingProvider,
          delivered: true,
          updatesCount,
          finalNotificationSent: false,
          escalation: sendFinalNotificationResult.escalation,
        };
      }
      context.state.status = 'cancelled';
      return {
        success: false,
        state: context.state,
        trackingNumber: context.state.wooOrder?.trackingNumber,
        trackingProvider: context.state.wooOrder?.trackingProvider,
        delivered: true,
        updatesCount,
        finalNotificationSent: false,
      };
    }

    finalNotificationSent = true;

    log.info('WISMO tracking phase completed successfully', {
      trackingNumber: context.state.wooOrder?.trackingNumber,
      updatesCount,
      finalNotificationSent,
    });

    return {
      success: true,
      state: context.state,
      trackingNumber: context.state.wooOrder?.trackingNumber,
      trackingProvider: context.state.wooOrder?.trackingProvider,
      delivered: true,
      updatesCount,
      finalNotificationSent,
    };
  } catch (error) {
    log.error('WISMO tracking phase failed', { error });
    throw error;
  }
}
