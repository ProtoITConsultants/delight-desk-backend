import { WorkflowState, EscalationDetails } from '../../../types';
import { FulfillmentMethod } from './order-cancellation.constants';

/**
 * Base interface for all phase results
 */
export interface OrderCancellationPhaseResult {
  success: boolean;
  state: WorkflowState;
  escalation?: EscalationDetails;
}

/**
 * Phase 1: Preparation Result
 * Actions: Mark email as read, Verify AI confidence
 */
export interface PreparationResult extends OrderCancellationPhaseResult {
  emailMarkedAsRead: boolean;
  confidenceVerified: boolean;
}

/**
 * Phase 2: Order Discovery Result
 * Actions: Extract order number, Request from customer if needed
 */
export interface OrderDiscoveryResult extends OrderCancellationPhaseResult {
  orderNumber: string;
  requiredCustomerInteraction: boolean;
  orderFoundInEmail: boolean;
}

/**
 * Phase 3: Order Processing Result
 * Actions: Fetch order, Validate status, Check duplicate/rate limit
 */
export interface OrderProcessingResult extends OrderCancellationPhaseResult {
  orderFetched: boolean;
  orderStatusValid: boolean;
  passedDuplicateCheck: boolean;
  passedRateLimitCheck: boolean;
  cancellationRequestId?: string;
}

/**
 * Phase 4: Eligibility Check Result
 * Actions: Time-based eligibility, Email validation
 */
export interface EligibilityCheckResult extends OrderCancellationPhaseResult {
  timeEligible: boolean;
  emailValid: boolean;
  eligibilityReason: string;
  proceedWithCancellation: boolean;
}

/**
 * Phase 5: Fulfillment Processing Result
 * Actions: Process cancellation based on fulfillment method
 */
export interface FulfillmentProcessingResult extends OrderCancellationPhaseResult {
  fulfillmentMethod: FulfillmentMethod;
  cancellationProcessed: boolean;
  refundProcessed: boolean;
  warehouseNotified?: boolean;
  warehouseResponded?: boolean;
  apiCancellationSuccess?: boolean;
}

/**
 * Time eligibility check result
 */
export interface TimeEligibilityResult {
  eligible: boolean;
  reason: string;
  orderCreatedAt: Date;
  currentTime: Date;
  hoursSinceOrder: number;
  extendedWindow?: boolean;
}

/**
 * Order status validation result
 */
export interface OrderStatusValidationResult {
  valid: boolean;
  reason: string;
  orderStatus: string;
  canProceed: boolean;
}

/**
 * Warehouse reply parsing result
 */
export interface WarehouseReplyResult {
  hasReply: boolean;
  canceled?: boolean;
  cannotCancel?: boolean;
  body?: string;
  emailId?: string;
  uncertainty?: boolean; // If response is ambiguous
}

/**
 * Agent settings specific to order cancellation
 */
export interface OrderCancellationSettings {
  fulfillmentMethod: FulfillmentMethod;
  warehouseEmail?: string;
  testWarehouseEmail?: string;
  requiresModeration: boolean;
  testMode: boolean;
  shipBobChannelId?: string;
  shipStationEnabled?: boolean;
}

/**
 * Cancellation request tracking
 */
export interface CancellationRequestRecord {
  id: string;
  userId: string;
  orderNumber: string;
  emailId: string;
  workflowId: string;
  status: 'processing' | 'completed' | 'failed' | 'cancelled';
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
