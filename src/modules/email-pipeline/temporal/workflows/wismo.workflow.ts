import {
  defineQuery,
  defineSignal,
  log,
  proxyActivities,
  setHandler,
  sleep,
} from '@temporalio/workflow';
import type { EmailActivities } from '../activities/email.activities';
import {
  EscalationType,
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
} = proxyActivities<typeof EmailActivities.prototype>({
  startToCloseTimeout: '5 minutes',
  retry: {
    initialInterval: '10s',
    maximumAttempts: 3,
  },
});

// Signals
export const humanResponseSignal = defineSignal<[HumanResponse]>('humanResponse');
// Queries
export const stateQuery = defineQuery<WorkflowState>('state');

const CLASSIFICATION_CONFIDENCE_THRESHOLD = 70;
const MAX_TRACKING_RETRIES_IN_DAYS = 7;
const TRACKING_RETRY_INTERVAL = '2 hours';
const STATUS_CHECK_INTERVAL = '2 hours';

export async function handleWismo(emailData: WorkFlowInput): Promise<string> {
  let state: WorkflowState = {
    emailData,
    classification: emailData.classification,
    trackingRetryCount: 0,
    escalation: {},
    humanResponse: {},
    status: 'processing',
    lastUpdated: new Date(),
  };

  let humanResponse: HumanResponse | null = null;

  // Setup signal handlers
  setHandler(humanResponseSignal, (response: HumanResponse) => {
    humanResponse = response;
    state.humanResponse = response;
    state.lastUpdated = new Date();
  });

  // Setup query handlers
  setHandler(stateQuery, () => state);

  try {
    // ==========================================
    // STEP 1: Email Classification Confidence Analysis For Escalation
    // ==========================================

    // @ts-ignore
    if (state.classification.confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD) {
      state.status = 'escalated';
      state.escalation = {
        type: EscalationType.LOW_CLASSIFICATION_CONFIDENCE,
        reason: 'Escalated due to low classification confidence',
        timestamp: new Date(),
      };
      return `Escalated due to low classification confidence`;
    }

    // ==========================================
    // STEP 2: Order Number Detection
    // ==========================================

    let orderDetection = await extractOrderNumberFromEmail(emailData.email);

    log.info('Order Detection', { orderDetection });

    if (!orderDetection?.orderNumbers?.length) {
      try {
        const order = await getMostRecentOrderByEmail(
          emailData.email.userId,
          emailData.email.fromEmail as string,
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
    try {
      if (!state.wooOrder) {
        const order = await getWooCommerceOrderById(
          emailData.email.userId,
          state.orderNumber as string,
        );
        state.wooOrder = formatWooCommerceOrder(order);
      }
    } catch (error) {
      state.status = 'escalated';
      state.escalation = {
        type: EscalationType.ORDER_NOT_FOUND,
        reason: 'Escalated due to order not found',
        timestamp: new Date(),
      };
      return `Escalated due to order not found`;
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
        const order = await getWooCommerceOrderById(
          emailData.email.userId,
          state.orderNumber as string,
        );
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
        // Notify customer by mail
        // await sendCustomerNotificationViaGmailThread({
        //   email: state.wooOrder.customerEmail,
        //   orderNumber: state.orderNumber,
        //   trackingStatus: latestTracking.tag,
        //   trackingUrl: `https://track.aftership.com/${latestTracking.trackingNumber}`,
        // });

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
        return `Escalated due to aftership exception.`;
      }
    }

    // TODO: Check user_agents and if 'requiresModeration' is true then send this task to approval queue,
    //  otherwise send final email directly

    // TODO: Final notification on delivered
    // await sendCustomerNotificationViaGmailThread({
    //   email: state.wooOrder.customerEmail,
    //   orderNumber: state.orderNumber,
    //   trackingStatus: 'Delivered',
    //   trackingUrl: `https://track.aftership.com/${state.aftershipTracking.trackingNumber}`,
    // });

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
