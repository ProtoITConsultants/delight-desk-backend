/**
 * Order Cancellation Fulfillment Sub-Workflow
 * Routes fulfillment execution to method-specific modules.
 */

import { log, proxyActivities } from '@temporalio/workflow';
import type { OrderCancellationActivities } from '../../../../activities/agents/order-cancellation/order-cancellation.activities';
import {
  ActionExecutionContext,
  EscalationError,
  EscalationType,
  OrderCancellationActionType,
} from '../../../types';
import { executeWorkflowAction } from '../../../workflow-action.helpers';
import { ACTIVITY_TIMEOUTS } from '../order-cancellation.constants';
import {
  FulfillmentExecutionResult,
  OrderCancellationWorkflowState,
} from '../order-cancellation.types';
import { buildOrderCancellationFailureResult } from './order-cancellation-subworkflow.helpers';
import { handleCustomWarehouseFulfillmentMethod } from './fulfillment/custom-warehouse-fulfillment.method';
import { FulfillmentMethod } from './fulfillment/order-cancellation-fulfillment.shared';
import { handleShipBobFulfillmentMethod } from './fulfillment/shipbob-fulfillment.method';
import { handleShipStationFulfillmentMethod } from './fulfillment/shipstation-fulfillment.method';
import { handleSelfFulfillmentMethod } from './fulfillment/self-fulfillment.method';

const orderCancellationActivities = proxyActivities<typeof OrderCancellationActivities.prototype>(
  ACTIVITY_TIMEOUTS.ORDER,
);
const { getFulfillmentMethod } = orderCancellationActivities;

export async function handleOrderCancellationFulfillment(
  context: ActionExecutionContext<OrderCancellationWorkflowState>,
): Promise<FulfillmentExecutionResult> {
  log.info('Starting Order Cancellation fulfillment phase', {
    workflowId: context.workflowId,
    orderNumber: context.state.orderNumber,
  });

  let fulfillmentMethod: FulfillmentMethod = 'self';

  try {
    const detectFulfillmentResult = await executeWorkflowAction(
      {
        type: OrderCancellationActionType.DETECT_FULFILLMENT_METHOD,
        step: 6,
        description: 'Detect user fulfillment method',
        actionDetails:
          "Detecting the user's configured fulfillment method to route order cancellation through the correct cancellation provider workflow.",
        skipApproval: true,
      },
      async () => {
        fulfillmentMethod = await getFulfillmentMethod(context.userId);
        context.state.fulfillmentMethod = fulfillmentMethod;
        return { fulfillmentMethod };
      },
      context,
    );

    const detectFulfillmentFailure = buildOrderCancellationFailureResult(
      context.state,
      detectFulfillmentResult,
    );
    if (detectFulfillmentFailure) {
      return {
        ...detectFulfillmentFailure,
        fulfillmentMethod,
        cancellationEligible: false,
        cancellationProcessed: false,
        refundProcessed: false,
        confirmationSent: false,
      };
    }

    const activeFulfillmentMethod =
      (detectFulfillmentResult.result?.fulfillmentMethod as FulfillmentMethod | undefined) ||
      context.state.fulfillmentMethod ||
      fulfillmentMethod;

    if (activeFulfillmentMethod === 'self') {
      return handleSelfFulfillmentMethod(context, activeFulfillmentMethod);
    }

    if (activeFulfillmentMethod === 'custom_warehouse') {
      return handleCustomWarehouseFulfillmentMethod(context, activeFulfillmentMethod);
    }

    if (activeFulfillmentMethod === 'shipbob') {
      return handleShipBobFulfillmentMethod(context, activeFulfillmentMethod);
    }

    if (activeFulfillmentMethod === 'shipstation') {
      return handleShipStationFulfillmentMethod(context, activeFulfillmentMethod);
    }

    throw new EscalationError(
      EscalationType.MANUAL_ESCALATION,
      `Fulfillment method "${activeFulfillmentMethod}" is not implemented in this iteration`,
      {
        fulfillmentMethod: activeFulfillmentMethod,
        supportedMethods: ['self', 'custom_warehouse', 'shipbob', 'shipstation'],
      },
    );
  } catch (error) {
    log.error('Order Cancellation fulfillment phase failed', { error });
    throw error;
  }
}
