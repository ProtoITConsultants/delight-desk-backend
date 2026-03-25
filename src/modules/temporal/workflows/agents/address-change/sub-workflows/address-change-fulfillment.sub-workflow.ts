import { condition, log, proxyActivities } from '@temporalio/workflow';
import type { EmailActivities } from '../../../../activities/shared/email.activities';
import type { AiIdentityActivities } from '../../../../activities/shared/ai-identity.activities';
import type { AddressChangeActivities } from '../../../../activities/agents/address-change/address-change.activities';
import {
  ActionExecutionContext,
  AddressChangeActionType,
  EscalationError,
  EscalationType,
} from '../../../types';
import { executeWorkflowAction, extractCustomerName } from '../../../workflow-action.helpers';
import {
  ACTIVITY_TIMEOUTS,
  ADDRESS_PARSE_MIN_CONFIDENCE,
  CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS,
} from '../address-change.constants';
import { extractEmail, formatAddressForMessage } from '../address-change.helpers';
import { AddressChangeWorkflowState, FulfillmentExecutionResult } from '../address-change.types';
import { buildAddressChangeFailureResult } from './address-change-subworkflow.helpers';

const emailActivities = proxyActivities<typeof EmailActivities.prototype>(ACTIVITY_TIMEOUTS.EMAIL);
const aiIdentityActivities = proxyActivities<typeof AiIdentityActivities.prototype>(
  ACTIVITY_TIMEOUTS.AI_IDENTITY,
);
const addressChangeActivities = proxyActivities<typeof AddressChangeActivities.prototype>(
  ACTIVITY_TIMEOUTS.ORDER,
);

const { sendCustomerNotificationViaThread, sendStandaloneEmail } = emailActivities;
const { getAiIdentity } = aiIdentityActivities;
const {
  getFulfillmentMethod,
  getWarehouseEmail,
  generateCustomWarehouseAddressChangeAcknowledgementMessage,
  generateCustomWarehouseAddressChangeRequestEmail,
  detectWarehouseAddressChangeReplyIntent,
  getShipBobOrderByWooCommerceOrderId,
  getShipStationOrderByWooCommerceOrderId,
  updateShipBobOrderShippingAddressByWooCommerceOrderId,
  updateShipStationOrderShippingAddressByWooCommerceOrderId,
  extractAddressChangeRequest,
  updateWooCommerceOrderShippingAddress,
  generateAddressChangeProcessedMessage,
  generateAddressChangeCannotProcessMessage,
} = addressChangeActivities;

function extractPlainEmailAddress(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.match(/<([^>]+)>/);
  return (match ? match[1] : email).trim().toLowerCase();
}

function toWooShipping(address: {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}) {
  return {
    first_name: address.firstName,
    last_name: address.lastName,
    company: address.company,
    address_1: address.address1 || '',
    address_2: address.address2,
    city: address.city || '',
    state: address.state,
    postcode: address.postalCode || '',
    country: address.country || '',
    phone: address.phone,
  };
}

function toShipBobRecipient(address: {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}) {
  return {
    name: [address.firstName, address.lastName].filter(Boolean).join(' ').trim() || 'Customer',
    address: {
      address1: address.address1 || '',
      address2: address.address2,
      city: address.city || '',
      state: address.state,
      country: address.country || '',
      zip_code: address.postalCode || '',
      company_name: address.company,
    },
    phone_number: address.phone,
  };
}

function toShipStationAddress(address: {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
}) {
  return {
    name: [address.firstName, address.lastName].filter(Boolean).join(' ').trim() || undefined,
    company: address.company,
    street1: address.address1 || '',
    street2: address.address2,
    city: address.city || '',
    state: address.state,
    postalCode: address.postalCode || '',
    country: address.country || '',
    phone: address.phone,
  };
}

export async function handleAddressChangeFulfillment(
  context: ActionExecutionContext<AddressChangeWorkflowState>,
): Promise<FulfillmentExecutionResult> {
  let fulfillmentMethod: 'self' | 'custom_warehouse' | 'shipstation' | 'shipbob' = 'self';
  let addressDetected = false;
  let addressUpdated = false;
  let confirmationSent = false;

  const customerName = extractCustomerName(context.email.fromEmail);
  const aiIdentity = await getAiIdentity(context.email.userId);

  const detectFulfillmentResult = await executeWorkflowAction(
    {
      type: AddressChangeActionType.DETECT_FULFILLMENT_METHOD,
      step: 6,
      description: 'Detect user fulfillment method',
      actionDetails:
        "Detecting the user's configured fulfillment method to route address change processing through the correct path.",
    },
    async () => {
      fulfillmentMethod = await getFulfillmentMethod(context.userId);
      context.state.fulfillmentMethod = fulfillmentMethod;
      return { fulfillmentMethod };
    },
    context,
  );
  const detectFailure = buildAddressChangeFailureResult(context.state, detectFulfillmentResult);
  if (detectFailure) {
    return {
      ...detectFailure,
      fulfillmentMethod,
      addressDetected: false,
      addressUpdated: false,
      confirmationSent: false,
    };
  }

  const addressSource = context.state.latestCustomerMessageBody || context.email.body || '';
  const parseAddressResult = await executeWorkflowAction(
    {
      type: AddressChangeActionType.EXTRACT_ADDRESS_DETAILS,
      step: 7,
      description: 'Extract requested shipping address from customer message',
      actionDetails:
        'Using AI extraction to parse the new shipping address fields from the customer email body.',
      metadata: {
        source: context.state.latestCustomerMessageBody ? 'latest_customer_reply' : 'initial_email',
      },
    },
    async () => {
      const extractedAddress = await extractAddressChangeRequest(addressSource);
      const requiredMissing = [
        !extractedAddress.address1 ? 'address1' : '',
        !extractedAddress.city ? 'city' : '',
        !extractedAddress.postalCode ? 'postalCode' : '',
        !extractedAddress.country ? 'country' : '',
      ].filter(Boolean);

      if (
        requiredMissing.length > 0 ||
        (extractedAddress.confidence || 0) < ADDRESS_PARSE_MIN_CONFIDENCE
      ) {
        throw new EscalationError(
          EscalationType.MANUAL_ESCALATION,
          'Could not confidently extract complete new address from customer message',
          {
            confidence: extractedAddress.confidence,
            threshold: ADDRESS_PARSE_MIN_CONFIDENCE,
            missingFields: requiredMissing,
          },
        );
      }

      context.state.requestedAddress = {
        firstName: extractedAddress.firstName,
        lastName: extractedAddress.lastName,
        company: extractedAddress.company,
        address1: extractedAddress.address1,
        address2: extractedAddress.address2,
        city: extractedAddress.city,
        state: extractedAddress.state,
        postalCode: extractedAddress.postalCode,
        country: extractedAddress.country,
        phone: extractedAddress.phone,
        confidence: extractedAddress.confidence,
      };

      return { extractedAddress: context.state.requestedAddress };
    },
    context,
  );
  const parseFailure = buildAddressChangeFailureResult(context.state, parseAddressResult);
  if (parseFailure) {
    return {
      ...parseFailure,
      fulfillmentMethod,
      addressDetected: false,
      addressUpdated: false,
      confirmationSent: false,
    };
  }
  addressDetected = true;
  const formattedAddress = formatAddressForMessage(context.state.requestedAddress || {});

  if (context.state.fulfillmentMethod === 'custom_warehouse') {
    const warehouseConfigResult = await executeWorkflowAction(
      {
        type: AddressChangeActionType.CONTACT_WAREHOUSE,
        step: 8,
        description: 'Load custom warehouse configuration',
        actionDetails: 'Loading configured warehouse email before contacting warehouse team.',
        metadata: {
          orderNumber: context.state.orderNumber,
        },
      },
      async () => {
        const warehouseEmail = await getWarehouseEmail(context.userId);
        if (!warehouseEmail) {
          throw new EscalationError(
            EscalationType.MANUAL_ESCALATION,
            'Warehouse email is not configured for custom warehouse fulfillment',
            {
              orderNumber: context.state.orderNumber,
            },
          );
        }
        context.state.warehouseEmail = warehouseEmail;
        return { warehouseEmail };
      },
      context,
    );
    const warehouseConfigFailure = buildAddressChangeFailureResult(
      context.state,
      warehouseConfigResult,
    );
    if (warehouseConfigFailure) {
      return {
        ...warehouseConfigFailure,
        fulfillmentMethod,
        addressDetected: true,
        addressUpdated: false,
        confirmationSent: false,
      };
    }

    const warehouseEmail = context.state.warehouseEmail as string;
    const customerAckMessage = await generateCustomWarehouseAddressChangeAcknowledgementMessage(
      context.state.orderNumber as string,
      customerName,
      aiIdentity,
    );
    const customerAckResult = await executeWorkflowAction(
      {
        type: AddressChangeActionType.SEND_ACKNOWLEDGEMENT,
        step: 8.1,
        description: 'Acknowledge request and notify customer warehouse check is in progress',
        actionDetails:
          'Sending customer acknowledgement that we are coordinating with the warehouse before applying address change.',
        proposedEmailBody: customerAckMessage,
        metadata: {
          orderNumber: context.state.orderNumber,
          warehouseEmail,
        },
      },
      async (humanResponse) => {
        const messageToSend = humanResponse?.modifiedData?.message ?? customerAckMessage;
        await sendCustomerNotificationViaThread(
          context.email.userId,
          extractEmail(context.email.fromEmail),
          context.email.subject ?? '',
          messageToSend,
          context.email.threadId,
        );
        return { sent: true };
      },
      context,
    );
    const customerAckFailure = buildAddressChangeFailureResult(context.state, customerAckResult);
    if (customerAckFailure) {
      return {
        ...customerAckFailure,
        fulfillmentMethod,
        addressDetected: true,
        addressUpdated: false,
        confirmationSent: false,
      };
    }

    const warehouseEmailContent = await generateCustomWarehouseAddressChangeRequestEmail(
      context.state.orderNumber as string,
      formattedAddress,
      context.workflowId,
      extractPlainEmailAddress(context.state.wooOrder?.billing?.email) ||
        extractEmail(context.email.fromEmail),
      aiIdentity,
    );
    const warehouseContactResult = await executeWorkflowAction(
      {
        type: AddressChangeActionType.CONTACT_WAREHOUSE,
        step: 8.2,
        description: 'Send address-change request to warehouse team',
        actionDetails:
          'Sending standalone email to custom warehouse and waiting for explicit updated/cannot_update response.',
        proposedEmailBody: warehouseEmailContent.body,
        metadata: {
          orderNumber: context.state.orderNumber,
          warehouseEmail,
        },
      },
      async () => {
        await sendStandaloneEmail(
          context.userId,
          warehouseEmail,
          warehouseEmailContent.subject,
          warehouseEmailContent.body,
        );
        return { sent: true };
      },
      context,
    );
    const warehouseContactFailure = buildAddressChangeFailureResult(
      context.state,
      warehouseContactResult,
    );
    if (warehouseContactFailure) {
      return {
        ...warehouseContactFailure,
        fulfillmentMethod,
        addressDetected: true,
        addressUpdated: false,
        confirmationSent: false,
      };
    }

    const warehouseWaitResult = await executeWorkflowAction(
      {
        type: AddressChangeActionType.WAIT_FOR_WAREHOUSE_REPLY,
        step: 8.3,
        description: `Wait up to ${CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS} hours for warehouse response`,
        actionDetails:
          'Waiting for warehouse email response and parsing updated/cannot_update intent before continuing.',
        metadata: {
          timeoutHours: CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS,
          warehouseEmail,
        },
      },
      async () => {
        const timeoutMs = CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS * 60 * 60 * 1000;
        const deadline = Date.now() + timeoutMs;
        context.state.awaitingWarehouseReply = true;
        context.state.warehouseReplyEmail = undefined;

        while (Date.now() < deadline) {
          const remaining = Math.max(deadline - Date.now(), 0);
          if (remaining === 0) break;
          const received = await condition(() => !!context.state.warehouseReplyEmail, remaining);
          if (!received) break;

          const reply = context.state.warehouseReplyEmail as any;
          context.state.warehouseReplyEmail = undefined;
          const replyFrom = extractPlainEmailAddress(reply?.fromEmail);
          if (!replyFrom || replyFrom !== extractPlainEmailAddress(warehouseEmail)) {
            log.info('Ignoring non-warehouse response while waiting for warehouse', { replyFrom });
            continue;
          }

          const parsed = await detectWarehouseAddressChangeReplyIntent(reply?.body);
          if (parsed === 'unknown') {
            log.info('Warehouse response was not actionable; continuing wait', {
              messageId: reply?.messageId,
            });
            continue;
          }

          context.state.awaitingWarehouseReply = false;
          return { outcome: parsed };
        }

        context.state.awaitingWarehouseReply = false;
        throw new EscalationError(
          EscalationType.WAREHOUSE_TIMEOUT,
          `No warehouse response within ${CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS} hours`,
          {
            orderNumber: context.state.orderNumber,
            warehouseEmail,
            timeoutHours: CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS,
          },
        );
      },
      context,
    );
    const warehouseWaitFailure = buildAddressChangeFailureResult(
      context.state,
      warehouseWaitResult,
    );
    if (warehouseWaitFailure) {
      return {
        ...warehouseWaitFailure,
        fulfillmentMethod,
        addressDetected: true,
        addressUpdated: false,
        confirmationSent: false,
      };
    }

    const outcome = warehouseWaitResult.result?.outcome as 'updated' | 'cannot_update' | undefined;
    if (outcome === 'cannot_update') {
      const cannotUpdateMessage = await generateAddressChangeCannotProcessMessage(
        context.state.orderNumber as string,
        'Our warehouse confirmed this address cannot be updated automatically at this stage.',
        customerName,
        aiIdentity,
      );
      const cannotUpdateNotifyResult = await executeWorkflowAction(
        {
          type: AddressChangeActionType.SEND_FINAL_NOTIFICATION,
          step: 8.4,
          description: 'Inform customer warehouse could not apply address update',
          actionDetails:
            'Warehouse confirmed address update cannot be completed. Sending final guidance to customer.',
          proposedEmailBody: cannotUpdateMessage,
          metadata: {
            orderNumber: context.state.orderNumber,
            warehouseOutcome: 'cannot_update',
          },
        },
        async (humanResponse) => {
          const messageToSend = humanResponse?.modifiedData?.message ?? cannotUpdateMessage;
          await sendCustomerNotificationViaThread(
            context.email.userId,
            extractEmail(context.email.fromEmail),
            context.email.subject ?? '',
            messageToSend,
            context.email.threadId,
          );
          return { sent: true };
        },
        context,
      );
      const cannotUpdateNotifyFailure = buildAddressChangeFailureResult(
        context.state,
        cannotUpdateNotifyResult,
      );
      if (cannotUpdateNotifyFailure) {
        return {
          ...cannotUpdateNotifyFailure,
          fulfillmentMethod,
          addressDetected: true,
          addressUpdated: false,
          confirmationSent: false,
        };
      }

      return {
        success: true,
        state: context.state,
        fulfillmentMethod,
        addressDetected: true,
        addressUpdated: false,
        confirmationSent: true,
      };
    }
  }

  const updateAddressResult = await executeWorkflowAction(
    {
      type: AddressChangeActionType.PROCESS_ADDRESS_CHANGE,
      step: context.state.fulfillmentMethod === 'custom_warehouse' ? 8.5 : 8,
      description: `Update shipping address for order #${context.state.orderNumber}`,
      actionDetails:
        context.state.fulfillmentMethod === 'custom_warehouse'
          ? 'Applying WooCommerce shipping address update only after warehouse confirmed update.'
          : 'Applying the newly requested shipping address with provider-first sequencing. External fulfillment provider is handled first where supported, then WooCommerce is synced.',
      metadata: {
        orderNumber: context.state.orderNumber,
        fulfillmentMethod,
      },
    },
    async () => {
      if (fulfillmentMethod === 'shipbob') {
        const shipBobOrder = await getShipBobOrderByWooCommerceOrderId(
          context.userId,
          context.state.orderNumber as string,
        );
        const shipBobStatus = String(shipBobOrder?.status || '').toLowerCase();

        if (!shipBobOrder) {
          throw new EscalationError(
            EscalationType.ORDER_NOT_FOUND,
            'No ShipBob order found for this WooCommerce order; cannot apply provider-first address change',
            {
              orderNumber: context.state.orderNumber,
              fulfillmentMethod,
            },
          );
        }

        const nonEditableStatuses = new Set([
          'completed',
          'cancelled',
          'partially fulfilled',
          'fulfilled',
        ]);
        if (nonEditableStatuses.has(shipBobStatus)) {
          throw new EscalationError(
            EscalationType.ORDER_ALREADY_PROCESSED,
            `ShipBob order status "${shipBobOrder.status}" is not editable for automatic address changes`,
            {
              orderNumber: context.state.orderNumber,
              shipBobOrderId: shipBobOrder.id,
              shipBobStatus: shipBobOrder.status,
            },
          );
        }

        await updateShipBobOrderShippingAddressByWooCommerceOrderId(
          context.userId,
          context.state.orderNumber as string,
          toShipBobRecipient(context.state.requestedAddress || {}),
        );
      }

      if (fulfillmentMethod === 'shipstation') {
        const shipStationOrder = await getShipStationOrderByWooCommerceOrderId(
          context.userId,
          context.state.orderNumber as string,
        );
        const shipmentStatus = String(shipStationOrder?.shipment_status || '').toLowerCase();

        if (!shipStationOrder) {
          throw new EscalationError(
            EscalationType.ORDER_NOT_FOUND,
            'No ShipStation shipment found for this WooCommerce order; cannot apply provider-first address change',
            {
              orderNumber: context.state.orderNumber,
              fulfillmentMethod,
            },
          );
        }

        const nonEditableStatuses = new Set(['label_purchased', 'cancelled']);
        if (nonEditableStatuses.has(shipmentStatus)) {
          throw new EscalationError(
            EscalationType.ORDER_ALREADY_PROCESSED,
            `ShipStation shipment status "${shipStationOrder.shipment_status}" is not editable for automatic address changes`,
            {
              orderNumber: context.state.orderNumber,
              shipmentId: shipStationOrder.shipment_id,
              shipmentStatus: shipStationOrder.shipment_status,
            },
          );
        }

        await updateShipStationOrderShippingAddressByWooCommerceOrderId(
          context.userId,
          context.state.orderNumber as string,
          toShipStationAddress(context.state.requestedAddress || {}),
        );
      }

      await updateWooCommerceOrderShippingAddress(
        context.userId,
        context.state.orderNumber as string,
        toWooShipping(context.state.requestedAddress || {}),
      );

      return { updated: true };
    },
    context,
  );
  const updateFailure = buildAddressChangeFailureResult(context.state, updateAddressResult);
  if (updateFailure) {
    if (
      updateFailure.escalation &&
      (context.state.fulfillmentMethod === 'shipbob' ||
        context.state.fulfillmentMethod === 'shipstation')
    ) {
      const cannotProcessMessage = await generateAddressChangeCannotProcessMessage(
        context.state.orderNumber as string,
        `Your order is managed via ${fulfillmentMethod}, so this address update requires manual review by our support team.`,
        customerName,
        aiIdentity,
      );
      try {
        await sendCustomerNotificationViaThread(
          context.email.userId,
          extractEmail(context.email.fromEmail),
          context.email.subject ?? '',
          cannotProcessMessage,
          context.email.threadId,
        );
      } catch (notificationError) {
        log.warn('Failed to send manual-review notification for provider-managed address change', {
          notificationError,
          fulfillmentMethod,
          orderNumber: context.state.orderNumber,
        });
      }
    }

    return {
      ...updateFailure,
      fulfillmentMethod,
      addressDetected: true,
      addressUpdated: false,
      confirmationSent: false,
    };
  }
  addressUpdated = true;
  const successMessage = await generateAddressChangeProcessedMessage(
    context.state.orderNumber as string,
    customerName,
    formattedAddress,
    aiIdentity,
  );

  const notifyResult = await executeWorkflowAction(
    {
      type: AddressChangeActionType.SEND_FINAL_NOTIFICATION,
      step: 9,
      description: 'Send address update confirmation to customer',
      actionDetails:
        'Sending customer confirmation after successful shipping-address update processing.',
      proposedEmailBody: successMessage,
      metadata: {
        orderNumber: context.state.orderNumber,
        fulfillmentMethod,
      },
    },
    async (humanResponse) => {
      const messageToSend = humanResponse?.modifiedData?.message ?? successMessage;
      await sendCustomerNotificationViaThread(
        context.email.userId,
        extractEmail(context.email.fromEmail),
        context.email.subject ?? '',
        messageToSend,
        context.email.threadId,
      );
      return { sent: true };
    },
    context,
  );
  const notifyFailure = buildAddressChangeFailureResult(context.state, notifyResult);
  if (notifyFailure) {
    const failureMessage = await generateAddressChangeCannotProcessMessage(
      context.state.orderNumber as string,
      'Address was updated but confirmation delivery needs manual follow-up',
      customerName,
      aiIdentity,
    );
    log.warn('Address change confirmation action failed', { failureMessage });
    return {
      ...notifyFailure,
      fulfillmentMethod,
      addressDetected: true,
      addressUpdated: true,
      confirmationSent: false,
    };
  }
  confirmationSent = true;

  return {
    success: true,
    state: context.state,
    fulfillmentMethod,
    addressDetected,
    addressUpdated,
    confirmationSent,
  };
}
