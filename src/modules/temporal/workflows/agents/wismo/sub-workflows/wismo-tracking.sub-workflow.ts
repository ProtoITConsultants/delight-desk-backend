/**
 * WISMO Tracking Sub-Workflow
 * Handles Actions 6-9: Wait for tracking, create tracking, monitor status, send final notification
 */

import { log, proxyActivities, sleep } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { OrderActivities } from '../../../../activities/shared/order.activities';
import type { WismoTrackingActivities } from '../../../../activities/agents/wismo/wismo-tracking.activities';
import type { CustomerMessageActivities } from '../../../../activities/shared/customer-message.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  WismoActionType,
} from '../../../types';
import { executeWorkflowAction, extractCustomerName } from '../../../workflow-action.helpers';
import { TrackingResult, WismoWorkflowState } from '../wismo.types';
import {
  ACTIVITY_TIMEOUTS,
  MAX_TRACKING_RETRIES_IN_DAYS,
  STATUS_CHECK_INTERVAL,
  TRACKING_RETRY_INTERVAL,
} from '../wismo.constants';
import { extractEmail, formatWooCommerceOrder } from '../wismo.helpers';
import { buildWismoFailureResult } from './wismo-subworkflow.helpers';

// Proxy activities
const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const wismoOrderActivities = proxyActivities<typeof OrderActivities.prototype>(
  ACTIVITY_TIMEOUTS.WISMO_ORDER,
);
const wismoTrackingActivities = proxyActivities<typeof WismoTrackingActivities.prototype>(
  ACTIVITY_TIMEOUTS.WISMO_TRACKING,
);
const wismoMessageActivities = proxyActivities<typeof CustomerMessageActivities.prototype>(
  ACTIVITY_TIMEOUTS.WISMO_MESSAGE,
);
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);

const { sendCustomerNotificationViaThread } = emailActivities;
const { getWooCommerceOrderById } = wismoOrderActivities;
const { createAfterShipTracking, fetchAfterShipStatus } = wismoTrackingActivities;
const { generateTrackingUpdateNotification } = wismoMessageActivities;
const { getAiIdentity } = aiIdentityActivities;
const EXCEPTION_TRACKING_TAGS = new Set(['Exception', 'AttemptFail', 'Expired']);

function buildTrackingLink(
  tracking?: Partial<{ courier_tracking_link?: string | null; tracking_number?: string | null }>,
): string {
  return tracking?.courier_tracking_link || tracking?.tracking_number || 'Not available';
}

function buildTrackingPhaseFailureResult(
  context: ActionExecutionContext<WismoWorkflowState>,
  failure: ReturnType<typeof buildWismoFailureResult>,
  options: {
    delivered: boolean;
    updatesCount: number;
    finalNotificationSent: boolean;
    includeTrackingInfo: boolean;
  },
): TrackingResult {
  const base: TrackingResult = {
    ...(failure || { success: false, state: context.state }),
    delivered: options.delivered,
    updatesCount: options.updatesCount,
    finalNotificationSent: options.finalNotificationSent,
  };

  if (!options.includeTrackingInfo) {
    return base;
  }

  return {
    ...base,
    trackingNumber: context.state.wooOrder?.trackingNumber,
    trackingProvider: context.state.wooOrder?.trackingProvider,
  };
}

function assertNoTrackingException(context: ActionExecutionContext<WismoWorkflowState>): void {
  const tag = context.state.aftershipTracking?.tag;
  if (!tag || !EXCEPTION_TRACKING_TAGS.has(tag)) {
    return;
  }

  throw new EscalationError(
    EscalationType.AFTERSHIP_EXCEPTION,
    `Shipping exception occurred: ${tag}`,
    {
      trackingStatus: tag,
      trackingNumber: context.state.aftershipTracking?.tracking_number,
      orderNumber: context.state.orderNumber,
      issue: 'Delivery exception occurred',
    },
  );
}

async function monitorTrackingUntilDelivered(
  context: ActionExecutionContext<WismoWorkflowState>,
  customerName: string,
  aiIdentity: Awaited<ReturnType<typeof getAiIdentity>>,
  updatesCount: number,
): Promise<{ finalStatus?: string; updatesCount: number; delivered: true }> {
  while (context.state.aftershipTracking && context.state.aftershipTracking.tag !== 'Delivered') {
    await sleep(STATUS_CHECK_INTERVAL);

    // Fetch latest status
    const latestTracking = await fetchAfterShipStatus(context.state.aftershipTracking.id!);
    context.state.aftershipTracking = latestTracking;

    // Check if status changed
    if (latestTracking.tag && latestTracking.tag !== context.state.lastTrackingTag) {
      const trackingLink = buildTrackingLink(latestTracking);

      const notificationMessage = await generateTrackingUpdateNotification(
        context.state.orderNumber as string,
        latestTracking.tag,
        trackingLink,
        customerName,
        aiIdentity,
        context.state.wooOrder,
        context.state.aftershipTracking,
      );

      // Send notification via Gmail thread.
      // Use the original subject so the recipient's mail client threads
      // this reply into the same conversation (buildReplyEmail adds "Re:").
      await sendCustomerNotificationViaThread(
        context.email.userId,
        extractEmail(context.email.fromEmail),
        context.email.subject ?? '',
        notificationMessage,
        context.email.threadId,
      );

      log.info('Tracking status changed - notification sent', {
        oldStatus: context.state.lastTrackingTag,
        newStatus: latestTracking.tag,
      });

      context.state.lastTrackingTag = latestTracking.tag;
      updatesCount++;
    }

    // Handle exception status - escalate
    assertNoTrackingException(context);
  }

  return {
    finalStatus: context.state.aftershipTracking?.tag,
    updatesCount,
    delivered: true,
  };
}

/**
 * Handle tracking phase: wait for tracking, create tracking, monitor status, send final notification
 * This is the longest-running phase, potentially spanning weeks
 */
export async function handleWismoTracking(
  context: ActionExecutionContext<WismoWorkflowState>,
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

    // Derive customer name from the incoming email address so it stays consistent
    // across the whole conversation (never flips to the WooCommerce billing name).
    const customerName = extractCustomerName(context.email.fromEmail);

    // ==========================================
    // ACTION 6: Wait for Tracking Number (with retry)
    // ==========================================

    const waitForTrackingResult = await executeWorkflowAction(
      {
        type: WismoActionType.WAIT_FOR_TRACKING,
        step: 6,
        name: `Wait for tracking number to become available (up to ${MAX_TRACKING_RETRIES_IN_DAYS} days)`,
        actionDetails: `Polling WooCommerce for a tracking number on order #${context.state.orderNumber}. Checks every ${TRACKING_RETRY_INTERVAL} for up to ${MAX_TRACKING_RETRIES_IN_DAYS} days.`,
        skipApproval: true,
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

    const waitForTrackingFailure = buildWismoFailureResult(context.state, waitForTrackingResult);
    if (waitForTrackingFailure) {
      return buildTrackingPhaseFailureResult(context, waitForTrackingFailure, {
        delivered: false,
        updatesCount: 0,
        finalNotificationSent: false,
        includeTrackingInfo: false,
      });
    }

    // ==========================================
    // ACTION 7: Create AfterShip Tracking
    // ==========================================

    const createTrackingResult = await executeWorkflowAction(
      {
        type: WismoActionType.CREATE_AFTERSHIP_TRACKING,
        step: 7,
        name: `Create AfterShip tracking for ${context.state.wooOrder?.trackingNumber}`,
        actionDetails: `Creating an AfterShip tracking entry to enable real-time shipment monitoring.`,
        skipApproval: true,
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

    const createTrackingFailure = buildWismoFailureResult(context.state, createTrackingResult);
    if (createTrackingFailure) {
      return buildTrackingPhaseFailureResult(context, createTrackingFailure, {
        delivered: false,
        updatesCount: 0,
        finalNotificationSent: false,
        includeTrackingInfo: true,
      });
    }

    // ==========================================
    // ACTION 8: Monitor Tracking Status (until delivered)
    // ==========================================

    const monitorTrackingResult = await executeWorkflowAction(
      {
        type: WismoActionType.MONITOR_TRACKING_STATUS,
        step: 8,
        name: 'Monitor tracking status and send updates until delivered',
        actionDetails: `Monitoring shipment status for order #${context.state.orderNumber} (tracking: ${context.state.aftershipTracking?.tracking_number}) until delivery. Checks status every ${STATUS_CHECK_INTERVAL} and automatically sends customer email notifications on each status change.`,
        skipApproval: true,
        metadata: {
          trackingNumber: context.state.aftershipTracking?.tracking_number,
          orderNumber: context.state.orderNumber,
        },
      },
      () => monitorTrackingUntilDelivered(context, customerName, aiIdentity, updatesCount),
      context,
    );

    const monitorTrackingFailure = buildWismoFailureResult(context.state, monitorTrackingResult);
    if (monitorTrackingFailure) {
      return buildTrackingPhaseFailureResult(context, monitorTrackingFailure, {
        delivered: false,
        updatesCount,
        finalNotificationSent: false,
        includeTrackingInfo: true,
      });
    }

    // Update updatesCount from monitoring result
    if (monitorTrackingResult.result?.updatesCount) {
      updatesCount = monitorTrackingResult.result.updatesCount;
    }

    // ==========================================
    // ACTION 9: Send Final Delivery Notification
    // ==========================================

    // Pre-generate the final notification so it can be shown and optionally edited in the UI
    const trackingLink = buildTrackingLink(context.state.aftershipTracking);

    const finalNotification = await generateTrackingUpdateNotification(
      context.state.orderNumber as string,
      'Delivered',
      trackingLink,
      customerName,
      aiIdentity,
      context.state.wooOrder,
      context.state.aftershipTracking,
    );

    const sendFinalNotificationResult = await executeWorkflowAction(
      {
        type: WismoActionType.SEND_FINAL_NOTIFICATION,
        step: 9,
        name: 'Send final delivery confirmation to customer',
        actionDetails: `Sending a delivery confirmation email to ${extractEmail(context.email.fromEmail)} for order #${context.state.orderNumber}. The AI-generated message below can be reviewed and edited before sending.`,
        proposedEmailBody: finalNotification,
        metadata: {
          orderNumber: context.state.orderNumber,
          trackingStatus: 'Delivered',
          trackingNumber: context.state.aftershipTracking?.tracking_number,
        },
        requiresUserData: true, // May need edited message from user
      },
      async (humanResponse) => {
        // Use human-provided modified message if available, otherwise use generated message
        const messageToSend = humanResponse?.modifiedData?.message ?? finalNotification;

        // Send the notification.
        // Use the original subject so the recipient's mail client threads
        // this reply into the same conversation (buildReplyEmail adds "Re:").
        await sendCustomerNotificationViaThread(
          context.email.userId,
          extractEmail(context.email.fromEmail),
          context.email.subject ?? '',
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

    const sendFinalNotificationFailure = buildWismoFailureResult(
      context.state,
      sendFinalNotificationResult,
    );
    if (sendFinalNotificationFailure) {
      return buildTrackingPhaseFailureResult(context, sendFinalNotificationFailure, {
        delivered: true,
        updatesCount,
        finalNotificationSent: false,
        includeTrackingInfo: true,
      });
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
