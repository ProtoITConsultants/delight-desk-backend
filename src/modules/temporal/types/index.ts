import { EmailEntity } from '../../../database/schema';
import { Tracking } from '@aftership/tracking-sdk/dist/model/Tracking';

export enum EscalationType {
  LOW_CLASSIFICATION_CONFIDENCE = 'low_classification_confidence',
  ORDER_NUMBER_DETECTION_FAILED = 'order_number_detection_failed',
  ORDER_NOT_FOUND = 'order_not_found',
  TRACKING_RETRY_THRESHOLD_EXCEEDED = 'tracking_retry_threshold_exceeded',
  INCONSISTENT_DATA = 'inconsistent_data',
  MANUAL_ESCALATION = 'manual_escalation',
  AFTERSHIP_EXCEPTION = 'aftership_exception',
  // Order Cancellation specific escalation types
  ORDER_NOT_ELIGIBLE = 'order_not_eligible',
  WAREHOUSE_TIMEOUT = 'warehouse_timeout',
  API_CANCELLATION_FAILED = 'api_cancellation_failed',
  DUPLICATE_REQUEST = 'duplicate_request',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  ORDER_ALREADY_PROCESSED = 'order_already_processed',
}

export enum HumanDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  MODIFY_AND_APPROVE = 'modify_and_approve',
}

export interface EscalationContext {
  type?: EscalationType;
  reason?: string;
  timestamp?: Date;
  currentState?: any;
  suggestedAction?: string;
  metadata?: Record<string, any>;
}

export interface HumanResponse {
  decision?: HumanDecision;
  modifiedData?: any;
  notes?: string;
  respondedAt?: Date;
  respondedBy?: string;
}

export interface WorkflowState {
  email: EmailEntity;
  classification: ClassificationResult;
  orderNumber?: string;
  wooOrder?: OrderDetails;
  aftershipTracking?: Tracking;
  trackingRetryCount?: number;
  lastTrackingTag?: string;
  cancellationRequestId?: string;
  customerReply?: string;
  escalation?: EscalationContext;
  humanResponse?: HumanResponse;
  approvalQueueId?: string;
  status?: 'processing' | 'awaiting_human' | 'completed' | 'failed' | 'cancelled' | 'escalated';
  lastUpdated?: Date;
  // Track responses per action (by approval item ID)
  // This is Temporal-safe: stored in workflow state, replayed correctly on restart
  actionResponses?: Record<string, HumanResponse>;
}

export interface OrderExtractionResult {
  orderNumbers?: string[];
  customerQuery: string;
}

export interface OrderDetails {
  orderId: string;
  status: string;
  id?: string | number;
  number?: string | number;
  trackingNumber?: string;
  trackingProvider?: string;
  customerInfo: any;
  items: any[];
  billing?: any;
  total?: string;
  date_created?: string | Date;
  date_created_gmt?: string | Date;
}

export interface ClassificationResult {
  category:
    | 'wismo'
    | 'subscription'
    | 'product'
    | 'returns'
    | 'promo_code'
    | 'address_change'
    | 'order_cancellation'
    | 'escalation'
    | 'thankful';
  confidence: number;
  reasoning: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface WorkFlowInput {
  email: EmailEntity;
  classification: ClassificationResult;
}

// Export workflow action types
export * from './workflow-actions.types';
