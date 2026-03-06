/**
 * WISMO Workflow Types
 * Type definitions specific to WISMO sub-workflows
 */

import { Tracking } from '@aftership/tracking-sdk/dist/model/Tracking';
import { EmailEntity } from '../../../../../database/schema';
import { EscalationDetails, OrderDetails, OrderExtractionResult, WorkflowState } from '../../types';

export interface WismoOrderDetection extends Partial<OrderExtractionResult> {}

/**
 * WISMO-specific workflow state extending the base WorkflowState.
 * Contains fields only relevant to the WISMO (Where Is My Order) agent.
 */
export interface WismoWorkflowState extends WorkflowState {
  orderNumber?: string;
  wooOrder?: OrderDetails;
  aftershipTracking?: Tracking;
  trackingRetryCount?: number;
  lastTrackingTag?: string;
  customerReply?: string;
  /** Set by the customerReplySignal handler when the customer replies to a follow-up email. */
  customerReplyEmail?: EmailEntity;
  /** True while the workflow is parked at condition() waiting for the customer to reply. */
  awaitingCustomerReply?: boolean;
}

/**
 * Base result interface for all WISMO phases
 */
export interface WismoPhaseResult {
  success: boolean;
  state: WismoWorkflowState;
  escalation?: EscalationDetails;
}

/**
 * Result from the preparation phase (Actions 1-2)
 */
export interface PreparationResult extends WismoPhaseResult {
  emailMarkedAsRead: boolean;
  confidenceVerified: boolean;
}

/**
 * Result from the order discovery phase (Actions 3-3.1)
 */
export interface OrderDiscoveryResult extends WismoPhaseResult {
  orderNumber?: string;
  requiredCustomerInteraction: boolean;
  customerReplied?: boolean;
  orderDetection?: WismoOrderDetection;
}

/**
 * Result from the order processing phase (Actions 4-5)
 */
export interface OrderProcessingResult extends WismoPhaseResult {
  orderFetched: boolean;
  acknowledgementSent: boolean;
}

/**
 * Result from the tracking phase (Actions 6-9)
 */
export interface TrackingResult extends WismoPhaseResult {
  trackingNumber?: string;
  trackingProvider?: string;
  delivered: boolean;
  updatesCount: number;
  finalNotificationSent: boolean;
}
