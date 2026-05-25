import { EmailEntity } from '../../../../database/schema';
import { EscalationType, WorkflowState } from './base.types';

/**
 * Enum defining all possible action types in the WISMO workflow
 */
export enum WismoActionType {
  MARK_EMAIL_READ = 'mark_email_read',
  VERIFY_AI_CONFIDENCE = 'verify_ai_confidence',
  DETECT_CUSTOMER_DISTRESS = 'detect_customer_distress',
  EXTRACT_ORDER_NUMBER = 'extract_order_number',
  FETCH_ORDER_DETAILS = 'fetch_order_details',
  SEND_ACKNOWLEDGEMENT = 'send_acknowledgement',
  WAIT_FOR_TRACKING = 'wait_for_tracking',
  CREATE_AFTERSHIP_TRACKING = 'create_aftership_tracking',
  MONITOR_TRACKING_STATUS = 'monitor_tracking_status',
  SEND_TRACKING_UPDATE = 'send_tracking_update',
  SEND_FINAL_NOTIFICATION = 'send_final_notification',
  REQUEST_ORDER_INFO = 'request_order_info',
  WAIT_FOR_CUSTOMER_REPLY = 'wait_for_customer_reply',
}

/**
 * Enum defining all possible action types in the Order Cancellation workflow
 */
export enum OrderCancellationActionType {
  MARK_EMAIL_READ = 'mark_email_read',
  VERIFY_AI_CONFIDENCE = 'verify_ai_confidence',
  DETECT_CUSTOMER_DISTRESS = 'detect_customer_distress',
  DETECT_FULFILLMENT_METHOD = 'detect_fulfillment_method',
  EXTRACT_ORDER_NUMBER = 'extract_order_number',
  REQUEST_ORDER_INFO = 'request_order_info',
  FETCH_ORDER_DETAILS = 'fetch_order_details',
  VALIDATE_ORDER_STATUS = 'validate_order_status',
  CHECK_DUPLICATE = 'check_duplicate',
  CHECK_RATE_LIMIT = 'check_rate_limit',
  RECORD_REQUEST = 'record_request',
  CHECK_TIME_ELIGIBILITY = 'check_time_eligibility',
  VALIDATE_CUSTOMER_EMAIL = 'validate_customer_email',
  SEND_ACKNOWLEDGEMENT = 'send_acknowledgement',
  PROCESS_CANCELLATION = 'process_cancellation',
  PROCESS_REFUND = 'process_refund',
  SEND_FINAL_NOTIFICATION = 'send_final_notification',
  CONTACT_WAREHOUSE = 'contact_warehouse',
  WAIT_FOR_WAREHOUSE_REPLY = 'wait_for_warehouse_reply',
}

export enum AddressChangeActionType {
  MARK_EMAIL_READ = 'mark_email_read',
  VERIFY_AI_CONFIDENCE = 'verify_ai_confidence',
  DETECT_CUSTOMER_DISTRESS = 'detect_customer_distress',
  DETECT_FULFILLMENT_METHOD = 'detect_fulfillment_method',
  EXTRACT_ORDER_NUMBER = 'extract_order_number',
  REQUEST_ORDER_INFO = 'request_order_info',
  FETCH_ORDER_DETAILS = 'fetch_order_details',
  VALIDATE_ORDER_STATUS = 'validate_order_status',
  VALIDATE_CUSTOMER_EMAIL = 'validate_customer_email',
  SEND_ACKNOWLEDGEMENT = 'send_acknowledgement',
  EXTRACT_ADDRESS_DETAILS = 'extract_address_details',
  CONTACT_WAREHOUSE = 'contact_warehouse',
  WAIT_FOR_WAREHOUSE_REPLY = 'wait_for_warehouse_reply',
  PROCESS_ADDRESS_CHANGE = 'process_address_change',
  SEND_FINAL_NOTIFICATION = 'send_final_notification',
}

export enum ProductActionType {
  MARK_EMAIL_READ = 'mark_email_read',
  VERIFY_AI_CONFIDENCE = 'verify_ai_confidence',
  RETRIEVE_PRODUCT_KNOWLEDGE = 'retrieve_product_knowledge',
  GENERATE_PRODUCT_RESPONSE = 'generate_product_response',
  SEND_PRODUCT_RESPONSE = 'send_product_response',
}

/**
 * Action types emitted by the Promo Code Agent. The agent has four scenario branches
 * (refund missed code, deny repeat use, application guidance, general inquiry) plus
 * shared preparation + send-reply actions. Names are aligned with the action label
 * map in workflow-action.helpers.ts so the approval queue UI displays human strings.
 */
export enum PromoCodeActionType {
  MARK_EMAIL_READ = 'mark_email_read',
  VERIFY_AI_CONFIDENCE = 'verify_ai_confidence',
  DETECT_CUSTOMER_DISTRESS = 'detect_customer_distress',
  CLASSIFY_PROMO_CODE_INTENT = 'pc_classify_intent',
  RESOLVE_PROMO_CODE_CONFIG = 'pc_resolve_config',
  ASSESS_FIRST_TIME_CUSTOMER = 'pc_assess_first_time_customer',
  EXTRACT_ORDER_NUMBER = 'extract_order_number',
  REQUEST_ORDER_INFO = 'request_order_info',
  FETCH_ORDER_DETAILS = 'fetch_order_details',
  CHECK_REFUND_ELIGIBILITY = 'pc_check_refund_eligibility',
  PROCESS_PROMO_CODE_REFUND = 'pc_process_refund',
  RETRIEVE_PRODUCT_KNOWLEDGE = 'retrieve_product_knowledge',
  GENERATE_RESPONSE_MESSAGE = 'pc_generate_response',
  SEND_RESPONSE_MESSAGE = 'pc_send_response',
}

export type WorkflowActionType =
  | WismoActionType
  | OrderCancellationActionType
  | AddressChangeActionType
  | ProductActionType
  | PromoCodeActionType;

/**
 * Action status enum for tracking approval queue items
 */
export enum ActionStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXECUTING = 'executing',
  AWAITING_CUSTOMER_REPLY = 'awaiting_customer_reply',
  EXECUTED = 'executed',
  FAILED = 'failed',
  ESCALATED = 'escalated',
  CANCELLED = 'cancelled',
}

/**
 * Configuration for a workflow action
 */
export interface ActionConfig {
  type: WorkflowActionType;
  step: number | string; // Supports both integers (1, 2, 3) and sub-steps (3.1, 3.2)
  name?: string; // Human-readable name (auto-generated from type if omitted)
  actionDetails?: string; // Comprehensive details for UI display (inputs/outputs)
  proposedEmailBody?: string; // Proposed email body for email-sending actions
  requiresUserData?: boolean; // For actions like "edit response"
  metadata?: Record<string, any>;
  /**
   * When true, this action executes automatically even when moderation is enabled.
   * Use for internal/backend actions (validations, data fetching, tracking) that
   * don't affect the customer directly and don't need human review.
   */
  skipApproval?: boolean;
}

/**
 * Context passed to action executors.
 * Generic over the workflow state type so agent-specific workflows
 * can use their extended state (e.g., WismoWorkflowState).
 */
export interface ActionExecutionContext<S extends WorkflowState = WorkflowState> {
  workflowId: string;
  workflowRunId: string;
  userId: string;
  email: EmailEntity;
  state: S;
  requiresModeration: boolean;
  agentType: string;
  approvalQueueId?: string;
}

/**
 * Result returned by action execution
 */
export interface ActionExecutionResult<T = any> {
  success: boolean;
  result?: T;
  escalation?: EscalationDetails;
  actionId?: string; // ID of the action record created
}

/**
 * Runtime controls available to action executors.
 * Allows long-running executors to reflect intermediate states in UI.
 */
export interface ActionRuntimeControl {
  setStatus: (
    status: ActionStatus,
    additionalData?: Omit<UpdateActionData, 'actionStatus'>,
  ) => Promise<void>;
}

/**
 * Details about an escalation
 */
export interface EscalationDetails {
  id: string;
  type: EscalationType;
  reason: string;
  aiSuggestedResponse?: string;
  aiSuggestedResponseConfidence?: string;
  metadata?: Record<string, any>;
}

/**
 * Custom error class for workflow escalations
 */
export class EscalationError extends Error {
  constructor(
    public type: EscalationType,
    public reason: string,
    public metadata?: Record<string, any>,
  ) {
    super(reason);
    this.name = 'EscalationError';
    Object.setPrototypeOf(this, EscalationError.prototype);
  }
}

/**
 * Data structure for creating approval queue (workflow-level)
 */
export interface CreateApprovalQueueData {
  userId: string;
  emailId: string;
  threadId: string;
  workflowId: string;
  workflowRunId: string;
  agentName: string;
  customerEmail: string;
  customerName?: string;
  emailSubject: string;
  emailBody: string;
  emailDate?: string;
  category?: string;
  confidence?: string;
  priority?: string;
  sentiment?: string;
  workflowMetadata?: Record<string, any>;
  plannedSteps?: any[];
}

/**
 * Data structure for creating approval queue actions
 */
export interface CreateActionData {
  approvalQueueId: string;
  actionType: WorkflowActionType;
  actionStep: number | string; // Supports both integers (1, 2, 3) and sub-steps (3.1, 3.2)
  actionStatus: ActionStatus;
  name?: string;
  actionDetails?: string;
  proposedEmailBody?: string;
}

/**
 * @deprecated Use CreateApprovalQueueData and CreateActionData instead
 * This interface is kept for backward compatibility
 */
export interface CreateApprovalItemData extends CreateApprovalQueueData {
  actionType: WorkflowActionType;
  actionStep: number | string; // Supports both integers (1, 2, 3) and sub-steps (3.1, 3.2)
  actionStatus: ActionStatus;
  parentWorkflowId: string;
  previousActionId?: string;
  proposedResponse: string;
}

/**
 * Update data for approval queue actions
 */
export interface UpdateActionData {
  actionStatus?: ActionStatus;
  escalationId?: string;
  escalationReason?: string;
}

/**
 * @deprecated Use UpdateActionData instead
 * This interface is kept for backward compatibility
 */
export interface UpdateApprovalItemData extends UpdateActionData {
  editedResponse?: string;
}
