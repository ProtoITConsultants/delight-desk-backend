// import { proxyActivities, sleep } from '@temporalio/workflow';
// import type { EmailActivities } from '../../../../activities/shared/email.activities';
// import type { OrderCancellationWooCommerceActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-woocommerce.activities';
// import type { OrderCancellationValidationActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-validation.activities';
// import type { OrderCancellationShipBobActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-shipbob.activities';
// import type { OrderCancellationShipStationActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-shipstation.activities';
// import { ActionExecutionContext, EscalationError, EscalationType } from '../../../../types';
// import {
//   FulfillmentProcessingResult,
//   OrderCancellationSettings,
// } from '../order-cancellation.types';
// import {
//   FulfillmentMethod,
//   ACTIVITY_TIMEOUTS,
//   RETRY_POLICIES,
//   WAREHOUSE_REPLY_CHECK_INTERVAL,
//   WAREHOUSE_REPLY_TIMEOUT_HOURS,
//   MESSAGE_PREFIXES,
// } from '../order-cancellation.constants';
// import { executeWorkflowAction } from '../../workflow-action.helpers';
// import { parseWarehouseReply } from '../order-cancellation.helpers';
//
// // Proxy activities
// const emailActivities = proxyActivities<typeof EmailActivities.prototype>({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.sendEmail,
//   retry: RETRY_POLICIES.standard,
// });
//
// const wooCommerceActivities = proxyActivities<
//   typeof OrderCancellationWooCommerceActivities.prototype
// >({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.cancelOrder,
//   retry: RETRY_POLICIES.extended,
// });
//
// const validationActivities = proxyActivities<
//   typeof OrderCancellationValidationActivities.prototype
// >({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.updateRequestStatus,
//   retry: RETRY_POLICIES.standard,
// });
//
// const shipBobActivities = proxyActivities<typeof OrderCancellationShipBobActivities.prototype>({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.cancelShipBob,
//   retry: RETRY_POLICIES.extended,
// });
//
// const shipStationActivities = proxyActivities<
//   typeof OrderCancellationShipStationActivities.prototype
// >({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.cancelShipStation,
//   retry: RETRY_POLICIES.extended,
// });
//
// const { sendCustomerNotificationViaGmailThread, checkForCustomerReplyInThread } = emailActivities;
// const { cancelAndRefundWooCommerceOrder } = wooCommerceActivities;
// const { updateCancellationRequestStatus } = validationActivities;
// const { getShipBobOrderByReference, checkShipBobCancellationEligibility, cancelShipBobOrder } =
//   shipBobActivities;
// const {
//   getShipStationOrderByNumber,
//   checkShipStationCancellationEligibility,
//   cancelShipStationOrder,
// } = shipStationActivities;
//
// /**
//  * Phase 5: Fulfillment Processing Sub-Workflow
//  *
//  * Handles cancellation processing based on fulfillment method:
//  * - WAREHOUSE_EMAIL: Send email to warehouse, wait for response
//  * - SHIPBOB: Check eligibility via API, cancel, refund
//  * - SHIPSTATION: Check eligibility via API, cancel, refund
//  * - SELF_FULFILLMENT: Direct WooCommerce cancellation and refund
//  */
// export async function handleOrderCancellationFulfillment(
//   context: ActionExecutionContext,
//   agentSettings: OrderCancellationSettings,
// ): Promise<FulfillmentProcessingResult> {
//   const fulfillmentMethod = agentSettings.fulfillmentMethod;
//   let cancellationProcessed = false;
//   let refundProcessed = false;
//   let warehouseNotified = false;
//   let warehouseResponded = false;
//   let apiCancellationSuccess = false;
//
//   try {
//     const { orderNumber, wooOrder, cancellationRequestId } = context.state;
//
//     if (!orderNumber || !wooOrder) {
//       throw new Error('Order information not available in state');
//     }
//
//     switch (fulfillmentMethod) {
//       case FulfillmentMethod.WAREHOUSE_EMAIL:
//         return await handleWarehouseEmailFlow(
//           context,
//           agentSettings,
//           orderNumber,
//           cancellationRequestId,
//         );
//
//       case FulfillmentMethod.SHIPBOB:
//         return await handleShipBobFlow(context, orderNumber, cancellationRequestId);
//
//       case FulfillmentMethod.SHIPSTATION:
//         return await handleShipStationFlow(context, orderNumber, cancellationRequestId);
//
//       case FulfillmentMethod.SELF_FULFILLMENT:
//         return await handleSelfFulfillmentFlow(context, orderNumber, cancellationRequestId);
//
//       default:
//         throw new EscalationError(
//           EscalationType.MANUAL_ESCALATION,
//           `Unknown fulfillment method: ${fulfillmentMethod}`,
//           { fulfillmentMethod, orderNumber },
//         );
//     }
//   } catch (error) {
//     if (error instanceof EscalationError) {
//       // Update cancellation request status to failed
//       if (context.state.cancellationRequestId) {
//         try {
//           await updateCancellationRequestStatus(
//             context.state.cancellationRequestId,
//             'failed',
//             { error: error.message },
//           );
//         } catch (updateError) {
//           // Log but don't fail the workflow
//           console.error('Failed to update cancellation request status:', updateError);
//         }
//       }
//
//       return {
//         success: false,
//         state: context.state,
//         escalation: error.toEscalationDetails(),
//         fulfillmentMethod,
//         cancellationProcessed,
//         refundProcessed,
//         warehouseNotified,
//         warehouseResponded,
//         apiCancellationSuccess,
//       };
//     }
//
//     // Unexpected error
//     throw error;
//   }
// }
//
// /**
//  * WAREHOUSE_EMAIL Flow
//  * Send email to warehouse, wait up to 8 hours for response
//  */
// async function handleWarehouseEmailFlow(
//   context: ActionExecutionContext,
//   agentSettings: OrderCancellationSettings,
//   orderNumber: string,
//   cancellationRequestId?: string,
// ): Promise<FulfillmentProcessingResult> {
//   let warehouseNotified = false;
//   let warehouseResponded = false;
//   let cancellationProcessed = false;
//   let refundProcessed = false;
//
//   // Action 11: Send acknowledgement to customer
//   await executeWorkflowAction(
//     context,
//     11,
//     'Send Customer Acknowledgement',
//     'Notifying customer that we are processing their cancellation',
//     async () => {
//       const customerEmail = context.email.from;
//
//       await sendCustomerNotificationViaGmailThread(
//         context.userId,
//         customerEmail,
//         `Order ${orderNumber} Cancellation Request`,
//         `Thank you for contacting us about cancelling order ${orderNumber}.
//
// We're on it — we're checking with our warehouse team to see if we can cancel this order before it ships.
//
// We'll get back to you as soon as possible.`,
//         context.email.threadId,
//       );
//
//       return { customerNotified: true };
//     },
//   );
//
//   // Action 12: Send urgent email to warehouse
//   await executeWorkflowAction(
//     context,
//     12,
//     'Send Warehouse Email',
//     'Sending cancellation request to warehouse',
//     async () => {
//       const warehouseEmail = agentSettings.testMode
//         ? agentSettings.testWarehouseEmail
//         : agentSettings.warehouseEmail;
//
//       if (!warehouseEmail) {
//         throw new Error('Warehouse email not configured');
//       }
//
//       const subjectPrefix = agentSettings.testMode ? MESSAGE_PREFIXES.testMode : '';
//       const urgentPrefix = MESSAGE_PREFIXES.urgentWarehouse;
//
//       await sendCustomerNotificationViaGmailThread(
//         context.userId,
//         warehouseEmail,
//         `${subjectPrefix} ${urgentPrefix} Cancel Order #${orderNumber}`,
//         `${urgentPrefix}
//
// Please respond to this email immediately with one of the following:
//
// 1. "Canceled" - if the order has been successfully cancelled
// 2. "Cannot cancel" or "Already shipped" - if the order has already shipped
//
// Order Details:
// - Order Number: ${orderNumber}
// - Customer: ${context.state.wooOrder?.billing?.first_name} ${context.state.wooOrder?.billing?.last_name}
// - Email: ${context.state.wooOrder?.billing?.email}
// - Total: $${context.state.wooOrder?.total}
//
// This requires immediate action. Please respond within 8 hours.
//
// Thank you,
// Automated Cancellation System`,
//         context.email.threadId,
//       );
//
//       warehouseNotified = true;
//
//       return {
//         warehouseEmail,
//         sentAt: new Date().toISOString(),
//       };
//     },
//   );
//
//   // Action 13: Wait for warehouse response
//   const maxWaitMinutes = WAREHOUSE_REPLY_TIMEOUT_HOURS * 60;
//   const checkIntervalMinutes = 10;
//   const maxChecks = maxWaitMinutes / checkIntervalMinutes;
//   let replyCheckCount = 0;
//   let lastCheckedMessageId = context.email.id;
//
//   while (!warehouseResponded && replyCheckCount < maxChecks) {
//     await sleep(WAREHOUSE_REPLY_CHECK_INTERVAL);
//     replyCheckCount++;
//
//     const reply = await checkForCustomerReplyInThread(
//       context.userId,
//       context.email.threadId,
//       lastCheckedMessageId,
//     );
//
//     if (reply.hasNewReply && reply.newEmail) {
//       warehouseResponded = true;
//       lastCheckedMessageId = reply.newEmail.id;
//
//       // Parse warehouse reply
//       const body = reply.newEmail.body || '';
//       const parsedReply = parseWarehouseReply(body);
//
//       if (parsedReply.uncertainty) {
//         // Ambiguous response - escalate
//         throw new EscalationError(
//           EscalationType.MANUAL_ESCALATION,
//           'Warehouse response is ambiguous',
//           {
//             warehouseReply: body,
//             orderNumber,
//           },
//         );
//       }
//
//       if (parsedReply.canceled) {
//         // Action 14: Process cancellation and refund
//         await executeWorkflowAction(
//           context,
//           14,
//           'Process Cancellation',
//           'Cancelling order and processing refund in WooCommerce',
//           async () => {
//             const result = await cancelAndRefundWooCommerceOrder(
//               context.userId,
//               orderNumber,
//               'Order cancelled by customer request',
//             );
//
//             cancellationProcessed = true;
//             refundProcessed = true;
//
//             // Update request status
//             if (cancellationRequestId) {
//               await updateCancellationRequestStatus(cancellationRequestId, 'completed', {
//                 refundId: result.refund.id,
//                 refundAmount: result.refund.total,
//               });
//             }
//
//             return result;
//           },
//         );
//
//         // Action 15: Send success notification
//         await executeWorkflowAction(
//           context,
//           15,
//           'Send Success Notification',
//           'Notifying customer of successful cancellation',
//           async () => {
//             const customerEmail = context.email.from;
//
//             await sendCustomerNotificationViaGmailThread(
//               context.userId,
//               customerEmail,
//               `Order ${orderNumber} Successfully Cancelled`,
//               `Good news! Your order ${orderNumber} has been successfully cancelled.
//
// A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.
//
// If you have any questions, please don't hesitate to reach out.
//
// Thank you for your business!`,
//               context.email.threadId,
//             );
//
//             return { customerNotified: true };
//           },
//         );
//       } else if (parsedReply.cannotCancel) {
//         // Action 16: Send return instructions
//         await executeWorkflowAction(
//           context,
//           16,
//           'Send Return Instructions',
//           'Notifying customer that order has shipped',
//           async () => {
//             const customerEmail = context.email.from;
//
//             await sendCustomerNotificationViaGmailThread(
//               context.userId,
//               customerEmail,
//               `Order ${orderNumber} - Return Instructions`,
//               `Thank you for contacting us about order ${orderNumber}.
//
//               Unfortunately, this order has already shipped and cannot be cancelled.
//
//               However, you can return the order once you receive it. Here's how:
//
//               1. Keep the package in its original condition
//               2. Reply to this email to request a return label
//               3. We'll provide a prepaid shipping label
//               4. Drop off the package at the carrier location
//               5. Refund will be processed once we receive the return
//
//               If you have any questions, please let us know.
//
//               Thank you for your understanding!`,
//               context.email.threadId,
//             );
//
//             // Update request status
//             if (cancellationRequestId) {
//               await updateCancellationRequestStatus(cancellationRequestId, 'cancelled', {
//                 reason: 'already_shipped',
//               });
//             }
//
//             return { customerNotified: true, returnInstructions: true };
//           },
//         );
//       }
//
//       break;
//     }
//   }
//
//   // Check if warehouse responded
//   if (!warehouseResponded) {
//     throw new EscalationError(
//       EscalationType.WAREHOUSE_TIMEOUT,
//       `No response from warehouse within ${WAREHOUSE_REPLY_TIMEOUT_HOURS} hours`,
//       {
//         orderNumber,
//         hoursWaited: WAREHOUSE_REPLY_TIMEOUT_HOURS,
//         checksPerformed: replyCheckCount,
//       },
//     );
//   }
//
//   return {
//     success: true,
//     state: context.state,
//     fulfillmentMethod: FulfillmentMethod.WAREHOUSE_EMAIL,
//     cancellationProcessed,
//     refundProcessed,
//     warehouseNotified,
//     warehouseResponded,
//   };
// }
//
// /**
//  * SHIPBOB Flow
//  * Check eligibility via API, cancel, process refund
//  */
// async function handleShipBobFlow(
//   context: ActionExecutionContext,
//   orderNumber: string,
//   cancellationRequestId?: string,
// ): Promise<FulfillmentProcessingResult> {
//   let cancellationProcessed = false;
//   let refundProcessed = false;
//   let apiCancellationSuccess = false;
//
//   // Action 11: Get ShipBob order
//   let shipBobOrder: any;
//
//   await executeWorkflowAction(
//     context,
//     11,
//     'Get ShipBob Order',
//     'Fetching order from ShipBob',
//     async () => {
//       shipBobOrder = await getShipBobOrderByReference(orderNumber);
//
//       if (!shipBobOrder) {
//         throw new EscalationError(
//           EscalationType.MANUAL_ESCALATION,
//           `Order ${orderNumber} not found in ShipBob`,
//           { orderNumber },
//         );
//       }
//
//       return {
//         shipBobOrderId: shipBobOrder.id,
//         status: shipBobOrder.status,
//       };
//     },
//   );
//
//   // Action 12: Check eligibility
//   await executeWorkflowAction(
//     context,
//     12,
//     'Check ShipBob Eligibility',
//     'Checking if order can be cancelled in ShipBob',
//     async () => {
//       const eligibility = await checkShipBobCancellationEligibility(shipBobOrder.id);
//
//       if (!eligibility.eligible) {
//         // Order already shipped - send return instructions
//         const customerEmail = context.email.from;
//
//         await sendCustomerNotificationViaGmailThread(
//           context.userId,
//           customerEmail,
//           `Order ${orderNumber} - Return Instructions`,
//           `Thank you for contacting us about order ${orderNumber}.
//
// Unfortunately, this order has already been fulfilled by our warehouse and cannot be cancelled.
//
// However, you can return the order once you receive it. Here's how:
//
// 1. Keep the package in its original condition
// 2. Reply to this email to request a return label
// 3. We'll provide a prepaid shipping label
// 4. Drop off the package at the carrier location
// 5. Refund will be processed once we receive the return
//
// Reason: ${eligibility.reason}
//
// If you have any questions, please let us know.
//
// Thank you for your understanding!`,
//           context.email.threadId,
//         );
//
//         // Update request status
//         if (cancellationRequestId) {
//           await updateCancellationRequestStatus(cancellationRequestId, 'cancelled', {
//             reason: eligibility.reason,
//             shipBobStatus: eligibility.order.status,
//           });
//         }
//
//         throw new EscalationError(
//           EscalationType.ORDER_NOT_ELIGIBLE,
//           eligibility.reason,
//           {
//             orderNumber,
//             shipBobOrderId: shipBobOrder.id,
//             shipBobStatus: eligibility.order.status,
//             customerNotified: true,
//           },
//         );
//       }
//
//       return {
//         eligible: true,
//         shipBobOrderId: shipBobOrder.id,
//         shipBobStatus: eligibility.order.status,
//       };
//     },
//   );
//
//   // Action 13: Send acknowledgement to customer
//   await executeWorkflowAction(
//     context,
//     13,
//     'Send Customer Acknowledgement',
//     'Notifying customer that we are processing their cancellation',
//     async () => {
//       const customerEmail = context.email.from;
//
//       await sendCustomerNotificationViaGmailThread(
//         context.userId,
//         customerEmail,
//         `Order ${orderNumber} Cancellation Request`,
//         `Thank you for contacting us about cancelling order ${orderNumber}.
//
// We're processing your cancellation request now with our fulfillment center.
//
// You'll receive a confirmation shortly.`,
//         context.email.threadId,
//       );
//
//       return { customerNotified: true };
//     },
//   );
//
//   // Action 14: Cancel via ShipBob API
//   await executeWorkflowAction(
//     context,
//     14,
//     'Cancel ShipBob Order',
//     'Cancelling order in ShipBob',
//     async () => {
//       const cancelResult = await cancelShipBobOrder(shipBobOrder.id);
//
//       if (!cancelResult.success) {
//         throw new EscalationError(
//           EscalationType.API_CANCELLATION_FAILED,
//           'Failed to cancel order via ShipBob API',
//           {
//             orderNumber,
//             shipBobOrderId: shipBobOrder.id,
//             cancelResult,
//           },
//         );
//       }
//
//       apiCancellationSuccess = true;
//       cancellationProcessed = true;
//
//       return {
//         success: true,
//         shipBobOrderId: shipBobOrder.id,
//         canceledShipments: cancelResult.canceledShipments,
//         failedShipments: cancelResult.failedShipments,
//       };
//     },
//   );
//
//   // Action 15: Process WooCommerce refund
//   await executeWorkflowAction(
//     context,
//     15,
//     'Process Refund',
//     'Processing refund in WooCommerce',
//     async () => {
//       const result = await cancelAndRefundWooCommerceOrder(
//         context.userId,
//         orderNumber,
//         'Order cancelled by customer request',
//       );
//
//       refundProcessed = true;
//
//       // Update request status
//       if (cancellationRequestId) {
//         await updateCancellationRequestStatus(cancellationRequestId, 'completed', {
//           refundId: result.refund.id,
//           refundAmount: result.refund.total,
//           shipBobOrderId: shipBobOrder.id,
//         });
//       }
//
//       return result;
//     },
//   );
//
//   // Action 16: Send success notification
//   await executeWorkflowAction(
//     context,
//     16,
//     'Send Success Notification',
//     'Notifying customer of successful cancellation',
//     async () => {
//       const customerEmail = context.email.from;
//
//       await sendCustomerNotificationViaGmailThread(
//         context.userId,
//         customerEmail,
//         `Order ${orderNumber} Successfully Cancelled`,
//         `Good news! Your order ${orderNumber} has been successfully cancelled.
//
// A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.
//
// If you have any questions, please don't hesitate to reach out.
//
// Thank you for your business!`,
//         context.email.threadId,
//       );
//
//       return { customerNotified: true };
//     },
//   );
//
//   return {
//     success: true,
//     state: context.state,
//     fulfillmentMethod: FulfillmentMethod.SHIPBOB,
//     cancellationProcessed,
//     refundProcessed,
//     apiCancellationSuccess,
//   };
// }
//
// /**
//  * SHIPSTATION Flow
//  * Check eligibility via API, cancel (void labels + delete), process refund
//  */
// async function handleShipStationFlow(
//   context: ActionExecutionContext,
//   orderNumber: string,
//   cancellationRequestId?: string,
// ): Promise<FulfillmentProcessingResult> {
//   let cancellationProcessed = false;
//   let refundProcessed = false;
//   let apiCancellationSuccess = false;
//
//   // Action 11: Get ShipStation order
//   let shipStationOrder: any;
//
//   await executeWorkflowAction(
//     context,
//     11,
//     'Get ShipStation Order',
//     'Fetching order from ShipStation',
//     async () => {
//       shipStationOrder = await getShipStationOrderByNumber(orderNumber);
//
//       if (!shipStationOrder) {
//         throw new EscalationError(
//           EscalationType.MANUAL_ESCALATION,
//           `Order ${orderNumber} not found in ShipStation`,
//           { orderNumber },
//         );
//       }
//
//       return {
//         shipStationOrderId: shipStationOrder.orderId,
//         orderStatus: shipStationOrder.orderStatus,
//       };
//     },
//   );
//
//   // Action 12: Check eligibility
//   await executeWorkflowAction(
//     context,
//     12,
//     'Check ShipStation Eligibility',
//     'Checking if order can be cancelled in ShipStation',
//     async () => {
//       const eligibility = await checkShipStationCancellationEligibility(orderNumber);
//
//       if (!eligibility.eligible) {
//         // Order already shipped - send return instructions
//         const customerEmail = context.email.from;
//
//         await sendCustomerNotificationViaGmailThread(
//           context.userId,
//           customerEmail,
//           `Order ${orderNumber} - Return Instructions`,
//           `Thank you for contacting us about order ${orderNumber}.
//
// Unfortunately, this order has already been shipped and cannot be cancelled.
//
// However, you can return the order once you receive it. Here's how:
//
// 1. Keep the package in its original condition
// 2. Reply to this email to request a return label
// 3. We'll provide a prepaid shipping label
// 4. Drop off the package at the carrier location
// 5. Refund will be processed once we receive the return
//
// Reason: ${eligibility.reason}
//
// If you have any questions, please let us know.
//
// Thank you for your understanding!`,
//           context.email.threadId,
//         );
//
//         // Update request status
//         if (cancellationRequestId) {
//           await updateCancellationRequestStatus(cancellationRequestId, 'cancelled', {
//             reason: eligibility.reason,
//             shipStationStatus: eligibility.order.orderStatus,
//           });
//         }
//
//         throw new EscalationError(
//           EscalationType.ORDER_NOT_ELIGIBLE,
//           eligibility.reason,
//           {
//             orderNumber,
//             shipStationOrderId: shipStationOrder.orderId,
//             orderStatus: eligibility.order.orderStatus,
//             customerNotified: true,
//           },
//         );
//       }
//
//       return {
//         eligible: true,
//         shipStationOrderId: shipStationOrder.orderId,
//         orderStatus: eligibility.order.orderStatus,
//       };
//     },
//   );
//
//   // Action 13: Send acknowledgement to customer
//   await executeWorkflowAction(
//     context,
//     13,
//     'Send Customer Acknowledgement',
//     'Notifying customer that we are processing their cancellation',
//     async () => {
//       const customerEmail = context.email.from;
//
//       await sendCustomerNotificationViaGmailThread(
//         context.userId,
//         customerEmail,
//         `Order ${orderNumber} Cancellation Request`,
//         `Thank you for contacting us about cancelling order ${orderNumber}.
//
// We're processing your cancellation request now with our shipping provider.
//
// You'll receive a confirmation shortly.`,
//         context.email.threadId,
//       );
//
//       return { customerNotified: true };
//     },
//   );
//
//   // Action 14: Cancel via ShipStation API (voids labels + deletes order)
//   await executeWorkflowAction(
//     context,
//     14,
//     'Cancel ShipStation Order',
//     'Cancelling order in ShipStation (voiding labels and deleting order)',
//     async () => {
//       const cancelResult = await cancelShipStationOrder(orderNumber);
//
//       if (!cancelResult.success) {
//         throw new EscalationError(
//           EscalationType.API_CANCELLATION_FAILED,
//           'Failed to cancel order via ShipStation API',
//           {
//             orderNumber,
//             shipStationOrderId: shipStationOrder.orderId,
//             cancelResult,
//           },
//         );
//       }
//
//       apiCancellationSuccess = true;
//       cancellationProcessed = true;
//
//       return {
//         success: true,
//         shipStationOrderId: shipStationOrder.orderId,
//         voidedLabels: cancelResult.voidedLabels,
//       };
//     },
//   );
//
//   // Action 15: Process WooCommerce refund
//   await executeWorkflowAction(
//     context,
//     15,
//     'Process Refund',
//     'Processing refund in WooCommerce',
//     async () => {
//       const result = await cancelAndRefundWooCommerceOrder(
//         context.userId,
//         orderNumber,
//         'Order cancelled by customer request',
//       );
//
//       refundProcessed = true;
//
//       // Update request status
//       if (cancellationRequestId) {
//         await updateCancellationRequestStatus(cancellationRequestId, 'completed', {
//           refundId: result.refund.id,
//           refundAmount: result.refund.total,
//           shipStationOrderId: shipStationOrder.orderId,
//         });
//       }
//
//       return result;
//     },
//   );
//
//   // Action 16: Send success notification
//   await executeWorkflowAction(
//     context,
//     16,
//     'Send Success Notification',
//     'Notifying customer of successful cancellation',
//     async () => {
//       const customerEmail = context.email.from;
//
//       await sendCustomerNotificationViaGmailThread(
//         context.userId,
//         customerEmail,
//         `Order ${orderNumber} Successfully Cancelled`,
//         `Good news! Your order ${orderNumber} has been successfully cancelled.
//
// A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.
//
// If you have any questions, please don't hesitate to reach out.
//
// Thank you for your business!`,
//         context.email.threadId,
//       );
//
//       return { customerNotified: true };
//     },
//   );
//
//   return {
//     success: true,
//     state: context.state,
//     fulfillmentMethod: FulfillmentMethod.SHIPSTATION,
//     cancellationProcessed,
//     refundProcessed,
//     apiCancellationSuccess,
//   };
// }
//
// /**
//  * SELF_FULFILLMENT Flow
//  * Direct WooCommerce cancellation and refund
//  */
// async function handleSelfFulfillmentFlow(
//   context: ActionExecutionContext,
//   orderNumber: string,
//   cancellationRequestId?: string,
// ): Promise<FulfillmentProcessingResult> {
//   let cancellationProcessed = false;
//   let refundProcessed = false;
//
//   // Action 11: Send acknowledgement
//   await executeWorkflowAction(
//     context,
//     11,
//     'Send Customer Acknowledgement',
//     'Notifying customer that we are processing their cancellation',
//     async () => {
//       const customerEmail = context.email.from;
//
//       await sendCustomerNotificationViaGmailThread(
//         context.userId,
//         customerEmail,
//         `Order ${orderNumber} Cancellation Request`,
//         `Thank you for contacting us about cancelling order ${orderNumber}.
//
// We're processing your cancellation request now.
//
// You'll receive a confirmation shortly.`,
//         context.email.threadId,
//       );
//
//       return { customerNotified: true };
//     },
//   );
//
//   // Action 12: Cancel and refund in WooCommerce
//   await executeWorkflowAction(
//     context,
//     12,
//     'Process Cancellation',
//     'Cancelling order and processing refund',
//     async () => {
//       const result = await cancelAndRefundWooCommerceOrder(
//         context.userId,
//         orderNumber,
//         'Order cancelled by customer request',
//       );
//
//       cancellationProcessed = true;
//       refundProcessed = true;
//
//       // Update request status
//       if (cancellationRequestId) {
//         await updateCancellationRequestStatus(cancellationRequestId, 'completed', {
//           refundId: result.refund.id,
//           refundAmount: result.refund.total,
//         });
//       }
//
//       return result;
//     },
//   );
//
//   // Action 13: Send success notification
//   await executeWorkflowAction(
//     context,
//     13,
//     'Send Success Notification',
//     'Notifying customer of successful cancellation',
//     async () => {
//       const customerEmail = context.email.from;
//
//       await sendCustomerNotificationViaGmailThread(
//         context.userId,
//         customerEmail,
//         `Order ${orderNumber} Successfully Cancelled`,
//         `Good news! Your order ${orderNumber} has been successfully cancelled.
//
// A refund of $${context.state.wooOrder?.total} will be processed to your original payment method within 5-7 business days.
//
// If you have any questions, please don't hesitate to reach out.
//
// Thank you for your business!`,
//         context.email.threadId,
//       );
//
//       return { customerNotified: true };
//     },
//   );
//
//   return {
//     success: true,
//     state: context.state,
//     fulfillmentMethod: FulfillmentMethod.SELF_FULFILLMENT,
//     cancellationProcessed,
//     refundProcessed,
//   };
// }
