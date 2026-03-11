/**
 * Order Cancellation Workflow Types
 * Type definitions specific to order cancellation sub-workflows
 */

import { EmailEntity } from '../../../../../database/schema';
import { EscalationDetails, OrderDetails, OrderExtractionResult, WorkflowState } from '../../types';

export interface OrderCancellationOrderDetection extends Partial<OrderExtractionResult> {}

/**
 * Order-cancellation-specific workflow state extending the base WorkflowState.
 * Contains fields needed for order identification and pre-cancellation processing.
 */
export interface OrderCancellationWorkflowState extends WorkflowState {
  orderNumber?: string;
  wooOrder?: OrderDetails;
  fulfillmentMethod?: 'self' | 'custom_warehouse' | 'shipstation' | 'shipbob';
  warehouseEmail?: string;
  awaitingWarehouseReply?: boolean;
  /** Set by warehouseReplySignal when warehouse responds on standalone thread. */
  warehouseReplyEmail?: EmailEntity;
  cancellationEligibility?: {
    eligible: boolean;
    reason: string;
    partialFulfillmentDetected?: boolean;
    status?: string;
  };
  cancellationResult?: {
    orderStatusUpdated?: boolean;
    refundProcessed?: boolean;
    refundId?: string;
    refundedAmount?: string;
  };
  customerReply?: string;
  /** Set by the customerReplySignal handler when the customer replies to a follow-up email. */
  customerReplyEmail?: EmailEntity;
  /** True while the workflow is parked at condition() waiting for the customer to reply. */
  awaitingCustomerReply?: boolean;
}

/**
 * Base result interface for all order cancellation phases
 */
export interface OrderCancellationPhaseResult {
  success: boolean;
  state: OrderCancellationWorkflowState;
  escalation?: EscalationDetails;
}

/**
 * Result from the preparation phase (Actions 1-2.1)
 */
export interface PreparationResult extends OrderCancellationPhaseResult {
  emailMarkedAsRead: boolean;
  confidenceVerified: boolean;
}

/**
 * Result from the order discovery phase (Actions 3-3.1)
 */
export interface OrderDiscoveryResult extends OrderCancellationPhaseResult {
  orderNumber?: string;
  requiredCustomerInteraction: boolean;
  customerReplied?: boolean;
  orderDetection?: OrderCancellationOrderDetection;
}

/**
 * Result from the order processing phase (Actions 4-5)
 */
export interface OrderProcessingResult extends OrderCancellationPhaseResult {
  orderFetched: boolean;
  acknowledgementSent: boolean;
}

/**
 * Result from fulfillment execution phase (Iteration 2)
 */
export interface FulfillmentExecutionResult extends OrderCancellationPhaseResult {
  fulfillmentMethod: 'self' | 'custom_warehouse' | 'shipstation' | 'shipbob';
  cancellationEligible: boolean;
  cancellationProcessed: boolean;
  refundProcessed: boolean;
  confirmationSent: boolean;
}
