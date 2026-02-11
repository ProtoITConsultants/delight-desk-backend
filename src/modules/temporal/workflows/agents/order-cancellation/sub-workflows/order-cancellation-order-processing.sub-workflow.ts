// import { proxyActivities, workflowInfo } from '@temporalio/workflow';
// import type { WismoOrderActivities } from '../../../../activities/agents/wismo/wismo-order.activities';
// import type { OrderCancellationValidationActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-validation.activities';
// import type { EmailActivities } from '../../../../activities/shared/email.activities';
// import { ActionExecutionContext, EscalationError, EscalationType } from '../../../../types';
// import { OrderProcessingResult } from '../order-cancellation.types';
// import {
//   ACTIVITY_TIMEOUTS,
//   RETRY_POLICIES,
// } from '../order-cancellation.constants';
// import { executeWorkflowAction } from '../../workflow-action.helpers';
// import { validateOrderStatus, formatOrderSummary } from '../order-cancellation.helpers';
//
// // Proxy activities
// const wismoOrderActivities = proxyActivities<typeof WismoOrderActivities.prototype>({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.fetchOrder,
//   retry: RETRY_POLICIES.standard,
// });
//
// const validationActivities = proxyActivities<
//   typeof OrderCancellationValidationActivities.prototype
// >({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.checkDuplicate,
//   retry: RETRY_POLICIES.standard,
// });
//
// const emailActivities = proxyActivities<typeof EmailActivities.prototype>({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.sendEmail,
//   retry: RETRY_POLICIES.standard,
// });
//
// const { getWooCommerceOrderById } = wismoOrderActivities;
// const { checkDuplicateRequest, checkRateLimit, recordCancellationRequest } = validationActivities;
// const { sendCustomerNotificationViaGmailThread } = emailActivities;
//
// /**
//  * Phase 3: Order Processing Sub-Workflow
//  *
//  * Actions:
//  * 4. Fetch order from WooCommerce
//  * 5. Validate order status
//  * 6. Check for duplicate request
//  * 7. Check rate limit
//  * 8. Record cancellation request
//  *
//  * This phase ensures the order exists, is in a cancellable state,
//  * and the customer hasn't exceeded limits.
//  */
// export async function handleOrderCancellationOrderProcessing(
//   context: ActionExecutionContext,
// ): Promise<OrderProcessingResult> {
//   let orderFetched = false;
//   let orderStatusValid = false;
//   let passedDuplicateCheck = false;
//   let passedRateLimitCheck = false;
//   let cancellationRequestId: string | undefined;
//
//   try {
//     const { orderNumber } = context.state;
//
//     if (!orderNumber) {
//       throw new Error('Order number not available in state');
//     }
//
//     // Action 4: Fetch order from WooCommerce
//     await executeWorkflowAction(
//       context,
//       4,
//       'Fetch Order',
//       `Fetching order ${orderNumber} from WooCommerce`,
//       async () => {
//         const order = await getWooCommerceOrderById(context.userId, orderNumber);
//
//         if (!order) {
//           throw new EscalationError(
//             EscalationType.MANUAL_ESCALATION,
//             `Order ${orderNumber} not found in WooCommerce`,
//             { orderNumber },
//           );
//         }
//
//         context.state.wooOrder = order;
//         orderFetched = true;
//
//         return {
//           orderNumber: order.number,
//           status: order.status,
//           total: order.total,
//           customerEmail: order.billing?.email,
//           summary: formatOrderSummary(order),
//         };
//       },
//     );
//
//     // Action 5: Validate order status
//     await executeWorkflowAction(
//       context,
//       5,
//       'Validate Order Status',
//       'Checking if order can be cancelled',
//       async () => {
//         const order = context.state.wooOrder;
//         const orderStatus = order?.status?.toLowerCase() || '';
//
//         const validation = validateOrderStatus(orderStatus);
//
//         if (!validation.valid) {
//           // Send notification to customer about the status
//           await sendCustomerNotificationViaGmailThread(
//             context.userId,
//             context.email.threadId,
//             `Order ${orderNumber} - ${orderStatus}`,
//             `We received your cancellation request for order ${orderNumber}.
//
// However, this order has a status of "${orderStatus}" and cannot be cancelled through our automated system.
//
// ${orderStatus === 'cancelled' ? 'The order has already been cancelled.' : ''}
// ${orderStatus === 'refunded' ? 'The order has already been refunded.' : ''}
// ${orderStatus === 'completed' || orderStatus === 'shipped' ? 'The order has already been shipped or completed. If you need to return this order, please let us know and we\'ll provide return instructions.' : ''}
//
// Our team will review your request and follow up with you shortly.
//
// Thank you for your patience.`,
//           );
//
//           // Escalate to human
//           throw new EscalationError(
//             EscalationType.ORDER_NOT_ELIGIBLE,
//             validation.reason,
//             {
//               orderNumber,
//               orderStatus,
//               customerNotified: true,
//             },
//           );
//         }
//
//         orderStatusValid = true;
//
//         return {
//           orderStatus,
//           valid: true,
//           canProceed: validation.canProceed,
//         };
//       },
//     );
//
//     // Action 6: Check for duplicate request
//     await executeWorkflowAction(
//       context,
//       6,
//       'Check Duplicate',
//       'Checking for duplicate cancellation request',
//       async () => {
//         const isDuplicate = await checkDuplicateRequest(context.userId, orderNumber);
//
//         if (isDuplicate) {
//           throw new EscalationError(
//             EscalationType.DUPLICATE_REQUEST,
//             `Duplicate cancellation request detected for order ${orderNumber}`,
//             {
//               orderNumber,
//               userId: context.userId,
//               window: '1 hour',
//             },
//           );
//         }
//
//         passedDuplicateCheck = true;
//
//         return {
//           isDuplicate: false,
//           orderNumber,
//         };
//       },
//     );
//
//     // Action 7: Check rate limit
//     await executeWorkflowAction(
//       context,
//       7,
//       'Check Rate Limit',
//       'Checking user rate limit for cancellation requests',
//       async () => {
//         const rateLimitExceeded = await checkRateLimit(context.userId);
//
//         if (rateLimitExceeded) {
//           throw new EscalationError(
//             EscalationType.RATE_LIMIT_EXCEEDED,
//             'User has exceeded rate limit for cancellation requests',
//             {
//               userId: context.userId,
//               limit: 5,
//               window: '24 hours',
//             },
//           );
//         }
//
//         passedRateLimitCheck = true;
//
//         return {
//           rateLimitExceeded: false,
//           userId: context.userId,
//         };
//       },
//     );
//
//     // Action 8: Record cancellation request
//     await executeWorkflowAction(
//       context,
//       8,
//       'Record Request',
//       'Recording cancellation request in database',
//       async () => {
//         const wfInfo = workflowInfo();
//
//         const requestId = await recordCancellationRequest(
//           context.userId,
//           orderNumber,
//           context.email.id,
//           wfInfo.workflowId,
//         );
//
//         cancellationRequestId = requestId;
//         context.state.cancellationRequestId = requestId;
//
//         return {
//           requestId,
//           orderNumber,
//           workflowId: wfInfo.workflowId,
//         };
//       },
//     );
//
//     return {
//       success: true,
//       state: context.state,
//       orderFetched,
//       orderStatusValid,
//       passedDuplicateCheck,
//       passedRateLimitCheck,
//       cancellationRequestId,
//     };
//   } catch (error) {
//     if (error instanceof EscalationError) {
//       return {
//         success: false,
//         state: context.state,
//         escalation: error.toEscalationDetails(),
//         orderFetched,
//         orderStatusValid,
//         passedDuplicateCheck,
//         passedRateLimitCheck,
//         cancellationRequestId,
//       };
//     }
//
//     // Unexpected error
//     throw error;
//   }
// }
