// import { proxyActivities, sleep } from '@temporalio/workflow';
// import type { EmailActivities } from '../../../../activities/shared/email.activities';
// import type { WismoOrderActivities } from '../../../../activities/agents/wismo/wismo-order.activities';
// import type { WismoMessageActivities } from '../../../../activities/agents/wismo/wismo-message.activities';
// import { ActionExecutionContext, EscalationError, EscalationType } from '../../../../types';
// import { OrderDiscoveryResult } from '../order-cancellation.types';
// import {
//   ACTIVITY_TIMEOUTS,
//   CUSTOMER_REPLY_CHECK_INTERVAL,
//   MAX_CUSTOMER_REPLY_WAIT_DAYS,
//   RETRY_POLICIES,
// } from '../order-cancellation.constants';
// import { executeWorkflowAction } from '../../../workflow-action.helpers';
// import { extractEmail } from '../order-cancellation.helpers';
//
// // Proxy activities
// const wismoOrderActivities = proxyActivities<typeof WismoOrderActivities.prototype>({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.fetchOrder,
//   retry: RETRY_POLICIES.standard,
// });
//
// const emailActivities = proxyActivities<typeof EmailActivities.prototype>({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.sendEmail,
//   retry: RETRY_POLICIES.standard,
// });
//
// const wismoMessageActivities = proxyActivities<typeof WismoMessageActivities.prototype>({
//   startToCloseTimeout: '2 minutes',
//   retry: RETRY_POLICIES.standard,
// });
//
// const { extractOrderNumberFromEmail, getMostRecentOrderByEmail } = wismoOrderActivities;
// const { sendCustomerNotificationViaGmailThread, checkForCustomerReplyInThread } = emailActivities;
// const { generateOrderInfoRequestMessage } = wismoMessageActivities;
//
// /**
//  * Phase 2: Order Discovery Sub-Workflow
//  *
//  * Actions:
//  * 3. Extract order number from email
//  * 3.1. If not found, request from customer and wait for reply
//  *
//  * This phase identifies the order number either from the email content
//  * or by interacting with the customer.
//  */
// export async function handleOrderCancellationOrderDiscovery(
//   context: ActionExecutionContext,
// ): Promise<OrderDiscoveryResult> {
//   let orderNumber = '';
//   let requiredCustomerInteraction = false;
//   let orderFoundInEmail = false;
//
//   try {
//     // Action 3: Extract order number from email
//     await executeWorkflowAction(
//       context,
//       3,
//       'Extract Order Number',
//       'Extracting order number from email',
//       async () => {
//         // Try to extract from email content
//         const extractedOrder = await extractOrderNumberFromEmail(
//           context.email.body,
//           context.email.subject,
//         );
//
//         if (extractedOrder) {
//           orderNumber = extractedOrder;
//           orderFoundInEmail = true;
//           context.state.orderNumber = orderNumber;
//
//           return {
//             orderNumber,
//             source: 'email_content',
//             found: true,
//           };
//         }
//
//         // Try to find most recent order by customer email
//         const customerEmail = extractEmail(context.email.from);
//
//         if (customerEmail) {
//           const recentOrder = await getMostRecentOrderByEmail(context.userId, customerEmail);
//
//           if (recentOrder && recentOrder.number) {
//             orderNumber = recentOrder.number;
//             orderFoundInEmail = true;
//             context.state.orderNumber = orderNumber;
//
//             return {
//               orderNumber,
//               source: 'customer_email_lookup',
//               found: true,
//             };
//           }
//         }
//
//         // Order not found
//         return {
//           orderNumber: null,
//           source: null,
//           found: false,
//         };
//       },
//     );
//
//     // If order found, we're done
//     if (orderFoundInEmail) {
//       return {
//         success: true,
//         state: context.state,
//         orderNumber,
//         requiredCustomerInteraction: false,
//         orderFoundInEmail: true,
//       };
//     }
//
//     // Action 3.1: Request order info from customer
//     requiredCustomerInteraction = true;
//
//     await executeWorkflowAction(
//       context,
//       3.1,
//       'Request Order Info',
//       'Requesting order number from customer',
//       async () => {
//         // Generate request message
//         const requestMessage = await generateOrderInfoRequestMessage(
//           context.userId,
//           context.email.from,
//           context.email.subject,
//         );
//
//         // Send email to customer
//         await sendCustomerNotificationViaGmailThread(
//           context.userId,
//           context.email.threadId,
//           requestMessage.subject,
//           requestMessage.body,
//         );
//
//         return {
//           messageSent: true,
//           threadId: context.email.threadId,
//         };
//       },
//     );
//
//     // Wait for customer reply (up to 3 days)
//     const maxWaitTime = MAX_CUSTOMER_REPLY_WAIT_DAYS * 24 * 60; // minutes
//     const checkInterval = 10; // minutes
//     const maxChecks = maxWaitTime / checkInterval;
//     let replyCheckCount = 0;
//     let customerReplied = false;
//
//     while (!customerReplied && replyCheckCount < maxChecks) {
//       await sleep(CUSTOMER_REPLY_CHECK_INTERVAL);
//       replyCheckCount++;
//
//       const reply = await checkForCustomerReplyInThread(
//         context.userId,
//         context.email.threadId,
//         context.email.id,
//       );
//
//       if (reply.hasReply && reply.body) {
//         customerReplied = true;
//
//         // Try to extract order number from reply
//         const extractedOrder = await extractOrderNumberFromEmail(reply.body, '');
//
//         if (extractedOrder) {
//           orderNumber = extractedOrder;
//           context.state.orderNumber = orderNumber;
//           context.state.customerReply = reply.body;
//
//           return {
//             success: true,
//             state: context.state,
//             orderNumber,
//             requiredCustomerInteraction: true,
//             orderFoundInEmail: false,
//           };
//         }
//
//         // Order number still not found in reply
//         throw new EscalationError(
//           EscalationType.MANUAL_ESCALATION,
//           'Customer replied but order number could not be extracted',
//           {
//             customerReply: reply.body,
//             emailId: reply.emailId,
//           },
//         );
//       }
//     }
//
//     // Customer didn't reply within timeout
//     if (!customerReplied) {
//       throw new EscalationError(
//         EscalationType.MANUAL_ESCALATION,
//         `No customer reply received within ${MAX_CUSTOMER_REPLY_WAIT_DAYS} days`,
//         {
//           daysWaited: MAX_CUSTOMER_REPLY_WAIT_DAYS,
//           checksPerformed: replyCheckCount,
//         },
//       );
//     }
//
//     // Should not reach here
//     throw new Error('Unexpected state in order discovery');
//   } catch (error) {
//     if (error instanceof EscalationError) {
//       return {
//         success: false,
//         state: context.state,
//         escalation: error.toEscalationDetails(),
//         orderNumber,
//         requiredCustomerInteraction,
//         orderFoundInEmail,
//       };
//     }
//
//     // Unexpected error
//     throw error;
//   }
// }
