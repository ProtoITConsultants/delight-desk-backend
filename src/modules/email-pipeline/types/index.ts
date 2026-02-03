import { EmailEntity } from '../../../database/schema';
import { Tracking } from '@aftership/tracking-sdk/dist/model/Tracking';

export interface OrderNumberResult {
  orderNumber: string | null;
  confidence: number;
  detectionMethod: string;
}

export interface WooCommerceOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  trackingNumber?: string;
  carrier?: string;
  customerEmail: string;
  items: any[];
}

export interface AfterShipTracking {
  trackingNumber: string;
  carrier: string;
  tag: string; // 'InTransit' | 'OutForDelivery' | 'Delivered' | 'Exception' etc.
  lastUpdate: Date;
  checkpoints: any[];
}

export enum EscalationType {
  LOW_CLASSIFICATION_CONFIDENCE = 'low_classification_confidence',
  ORDER_NUMBER_DETECTION_FAILED = 'order_number_detection_failed',
  ORDER_NOT_FOUND = 'order_not_found',
  TRACKING_RETRY_THRESHOLD_EXCEEDED = 'tracking_retry_threshold_exceeded',
  INCONSISTENT_DATA = 'inconsistent_data',
  MANUAL_ESCALATION = 'manual_escalation',
  AFTERSHIP_EXCEPTION = 'aftership_exception',
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
  trackingRetryCount: number;
  lastTrackingTag?: string;
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
  trackingNumber?: string;
  trackingProvider?: string;
  customerInfo: any;
  items: any[];
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
