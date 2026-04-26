import { EmailEntity } from '../../../../database/schema';

export enum EscalationType {
  LOW_CLASSIFICATION_CONFIDENCE = 'low_classification_confidence',
  CUSTOMER_DISTRESS_URGENT = 'customer_distress_urgent',
  ORDER_NUMBER_DETECTION_FAILED = 'order_number_detection_failed',
  ORDER_NOT_FOUND = 'order_not_found',
  TRACKING_RETRY_THRESHOLD_EXCEEDED = 'tracking_retry_threshold_exceeded',
  INCONSISTENT_DATA = 'inconsistent_data',
  MANUAL_ESCALATION = 'manual_escalation',
  AFTERSHIP_EXCEPTION = 'aftership_exception',
  ORDER_NOT_ELIGIBLE = 'order_not_eligible',
  WAREHOUSE_TIMEOUT = 'warehouse_timeout',
  API_CANCELLATION_FAILED = 'api_cancellation_failed',
  DUPLICATE_REQUEST = 'duplicate_request',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  ORDER_ALREADY_PROCESSED = 'order_already_processed',
  PRODUCT_KNOWLEDGE_NOT_FOUND = 'product_knowledge_not_found',
  PRODUCT_KNOWLEDGE_LOW_SIMILARITY = 'product_knowledge_low_similarity',
  PROMO_CODE_NOT_CONFIGURED = 'promo_code_not_configured',
  PROMO_CODE_NOT_FOUND_IN_EMAIL = 'promo_code_not_found_in_email',
  PROMO_CODE_INACTIVE_OR_EXPIRED = 'promo_code_inactive_or_expired',
  PROMO_CODE_REFUND_INELIGIBLE = 'promo_code_refund_ineligible',
  PROMO_CODE_REFUND_FAILED = 'promo_code_refund_failed',
  PROMO_CODE_INTENT_UNCLEAR = 'promo_code_intent_unclear',
  PROMO_CODE_APPLICATION_GUIDANCE_NOT_FOUND = 'promo_code_application_guidance_not_found',
}

export enum HumanDecision {
  APPROVE = 'approve',
  REJECT = 'reject',
  MODIFY_AND_APPROVE = 'modify_and_approve',
}

export interface HumanModifiedData {
  message?: string;
  [key: string]: unknown;
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
  modifiedData?: HumanModifiedData;
  notes?: string;
  respondedAt?: Date;
  respondedBy?: string;
}

export interface ClassificationResult {
  category:
    | 'wismo'
    | 'subscription'
    | 'product'
    | 'returns'
    | 'promo_code'
    | 'address_change'
    | 'order_cancellation';
  confidence: number;
  reasoning: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  sentiment: 'positive' | 'neutral' | 'negative';
  scenarios?: {
    escalation: boolean;
    thankful: boolean;
  };
}

export interface WorkFlowInput {
  email: EmailEntity;
  classification: ClassificationResult;
}

/**
 * Base workflow state shared across all agent workflows.
 * Agent-specific workflows should extend this with their own fields.
 */
export interface WorkflowState {
  email: EmailEntity;
  classification: ClassificationResult;
  escalation?: EscalationContext;
  humanResponse?: HumanResponse;
  approvalQueueId?: string;
  status?: 'processing' | 'awaiting_human' | 'completed' | 'failed' | 'cancelled' | 'escalated';
  lastUpdated?: Date;
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
