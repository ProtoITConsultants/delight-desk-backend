/**
 * WISMO Workflow Types
 * Type definitions specific to WISMO sub-workflows
 */

import { WorkflowState } from '../../../types';
import { EscalationDetails } from '../../../types';

/**
 * Base result interface for all WISMO phases
 */
export interface WismoPhaseResult {
  success: boolean;
  state: WorkflowState;
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
  orderDetection?: any;
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
