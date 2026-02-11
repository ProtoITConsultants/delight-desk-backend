import { EmailEntity } from '../../../database/schema';
import { EscalationType, WorkflowState } from './index';

/**
 * Enum defining all possible action types in the WISMO workflow
 */
export enum WismoActionType {
  MARK_EMAIL_READ = 'mark_email_read',
  VERIFY_AI_CONFIDENCE = 'verify_ai_confidence',
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
 * Action status enum for tracking approval queue items
 */
export enum ActionStatus {
  PENDING_APPROVAL = 'pending_approval',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXECUTING = 'executing',
  EXECUTED = 'executed',
  FAILED = 'failed',
  ESCALATED = 'escalated',
}

/**
 * Configuration for a workflow action
 */
export interface ActionConfig {
  type: WismoActionType;
  step: number | string; // Supports both integers (1, 2, 3) and sub-steps (3.1, 3.2)
  description: string;
  requiresUserData?: boolean; // For actions like "edit response"
  metadata?: Record<string, any>;
}

/**
 * Context passed to action executors
 */
export interface ActionExecutionContext {
  workflowId: string;
  workflowRunId: string;
  userId: string;
  email: EmailEntity;
  state: WorkflowState;
  requiresModeration: boolean;
  agentType: string;
  approvalQueueId?: string; // Reference to the approval queue workflow item
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
  agentType: string;
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
  actionType: WismoActionType;
  actionStep: number | string; // Supports both integers (1, 2, 3) and sub-steps (3.1, 3.2)
  actionStatus: ActionStatus;
  description: string;
  metadata?: Record<string, any>;
  autoApproved: boolean;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
}

/**
 * @deprecated Use CreateApprovalQueueData and CreateActionData instead
 * This interface is kept for backward compatibility
 */
export interface CreateApprovalItemData extends CreateApprovalQueueData {
  actionType: WismoActionType;
  actionStep: number | string; // Supports both integers (1, 2, 3) and sub-steps (3.1, 3.2)
  actionStatus: ActionStatus;
  parentWorkflowId: string;
  previousActionId?: string;
  autoApproved: boolean;
  proposedResponse: string;
}

/**
 * Update data for approval queue actions
 */
export interface UpdateActionData {
  actionStatus?: ActionStatus;
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  executedAt?: Date;
  executionResult?: Record<string, any>;
  escalatedDuringExecution?: boolean;
  escalationId?: string;
  executionError?: Record<string, any>;
}

/**
 * @deprecated Use UpdateActionData instead
 * This interface is kept for backward compatibility
 */
export interface UpdateApprovalItemData extends UpdateActionData {
  editedResponse?: string;
}
