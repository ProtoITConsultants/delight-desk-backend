// import { proxyActivities } from '@temporalio/workflow';
// import type { OrderCancellationValidationActivities } from '../../../../activities/agents/order-cancellation/order-cancellation-validation.activities';
// import { ActionExecutionContext, EscalationError, EscalationType } from '../../../../types';
// import { EligibilityCheckResult } from '../order-cancellation.types';
// import { ACTIVITY_TIMEOUTS, RETRY_POLICIES } from '../order-cancellation.constants';
// import { executeWorkflowAction } from '../../workflow-action.helpers';
// import {
//   checkTimeEligibility,
//   extractEmail,
//   calculateHoursUntilDeadline,
// } from '../order-cancellation.helpers';
//
// // Proxy activities
// const validationActivities = proxyActivities<
//   typeof OrderCancellationValidationActivities.prototype
// >({
//   startToCloseTimeout: ACTIVITY_TIMEOUTS.validateEmail,
//   retry: RETRY_POLICIES.standard,
// });
//
// const { validateCustomerEmail } = validationActivities;
//
// /**
//  * Phase 4: Eligibility Check Sub-Workflow
//  *
//  * Actions:
//  * 9. Check time-based eligibility
//  * 10. Validate customer email ownership
//  *
//  * This phase ensures the order is within the cancellation window
//  * and the customer owns the order.
//  */
// export async function handleOrderCancellationEligibility(
//   context: ActionExecutionContext,
// ): Promise<EligibilityCheckResult> {
//   let timeEligible = false;
//   let emailValid = false;
//   let eligibilityReason = '';
//   let proceedWithCancellation = true;
//
//   try {
//     const { wooOrder, orderNumber } = context.state;
//
//     if (!wooOrder) {
//       throw new Error('WooCommerce order not available in state');
//     }
//
//     // Action 9: Check time-based eligibility
//     await executeWorkflowAction(
//       context,
//       9,
//       'Check Time Eligibility',
//       'Checking if order is within cancellation window',
//       async () => {
//         const orderCreatedAt = wooOrder.date_created || wooOrder.date_created_gmt;
//
//         if (!orderCreatedAt) {
//           throw new Error('Order creation date not available');
//         }
//
//         const eligibility = checkTimeEligibility(orderCreatedAt);
//
//         timeEligible = eligibility.eligible;
//         eligibilityReason = eligibility.reason;
//
//         const hoursRemaining = calculateHoursUntilDeadline(orderCreatedAt);
//
//         return {
//           eligible: eligibility.eligible,
//           reason: eligibility.reason,
//           orderCreatedAt: eligibility.orderCreatedAt.toISOString(),
//           currentTime: eligibility.currentTime.toISOString(),
//           hoursSinceOrder: eligibility.hoursSinceOrder,
//           hoursRemaining,
//           extendedWindow: eligibility.extendedWindow,
//         };
//       },
//     );
//
//     // Action 10: Validate customer email
//     await executeWorkflowAction(
//       context,
//       10,
//       'Validate Customer Email',
//       'Verifying customer owns this order',
//       async () => {
//         const customerEmailFromRequest = extractEmail(context.email.from);
//         const orderEmail = wooOrder.billing?.email;
//
//         if (!customerEmailFromRequest) {
//           throw new EscalationError(
//             EscalationType.MANUAL_ESCALATION,
//             'Could not extract customer email from request',
//             {
//               fromEmail: context.email.from,
//               orderNumber,
//             },
//           );
//         }
//
//         if (!orderEmail) {
//           throw new EscalationError(
//             EscalationType.MANUAL_ESCALATION,
//             'Order does not have billing email',
//             {
//               orderNumber,
//               customerEmail: customerEmailFromRequest,
//             },
//           );
//         }
//
//         const isValid = await validateCustomerEmail(customerEmailFromRequest, orderEmail);
//
//         if (!isValid) {
//           throw new EscalationError(
//             EscalationType.MANUAL_ESCALATION,
//             'Customer email does not match order email',
//             {
//               customerEmail: customerEmailFromRequest,
//               orderEmail,
//               orderNumber,
//               securityCheck: 'failed',
//             },
//           );
//         }
//
//         emailValid = true;
//
//         return {
//           customerEmail: customerEmailFromRequest,
//           orderEmail,
//           valid: true,
//         };
//       },
//     );
//
//     // Both checks passed
//     proceedWithCancellation = true;
//
//     return {
//       success: true,
//       state: context.state,
//       timeEligible,
//       emailValid,
//       eligibilityReason,
//       proceedWithCancellation,
//     };
//   } catch (error) {
//     if (error instanceof EscalationError) {
//       return {
//         success: false,
//         state: context.state,
//         escalation: error.toEscalationDetails(),
//         timeEligible,
//         emailValid,
//         eligibilityReason,
//         proceedWithCancellation: false,
//       };
//     }
//
//     // Unexpected error
//     throw error;
//   }
// }
