import type { EmailEntity, PromoCodeConfigurationEntity } from '../../../../../database/schema';
import { EscalationDetails, WorkflowState } from '../../types';
import type {
  FirstTimeAssessment,
  PromoCodeAgentSettings,
  PromoCodeIntentResult,
  PromoCodeRefundEligibility,
} from '../../../activities/agents/promo-code/promo-code.activities';

/**
 * Workflow state for the Promo Code Agent. Tracks the AI sub-intent, the matched
 * configuration, customer history, and any refund decision so each phase can hand
 * data to the next without re-running activities.
 */
export interface PromoCodeWorkflowState extends WorkflowState {
  intent?: PromoCodeIntentResult;
  matchedConfig?: PromoCodeConfigurationEntity | null;
  agentSettings?: PromoCodeAgentSettings;
  firstTimeAssessment?: FirstTimeAssessment;
  refundEligibility?: PromoCodeRefundEligibility;
  refundResult?: { refundId: string; amount: string };
  generatedResponse?: string;
  resolvedOrderId?: string | null;
  /**
   * Set by the customerReplySignal handler when InfraService receives a reply on the
   * thread. The order-discovery step waits on this via condition() when it has to ask
   * the customer for an order number that wasn't extractable from the original email.
   */
  customerReplyEmail?: EmailEntity;
  /** True while the workflow is parked at condition() waiting for the customer to reply. */
  awaitingCustomerReply?: boolean;
}

export interface PromoCodePhaseResult {
  success: boolean;
  state: PromoCodeWorkflowState;
  escalation?: EscalationDetails;
}

export interface PromoCodePreparationResult extends PromoCodePhaseResult {
  emailMarkedAsRead: boolean;
  confidenceVerified: boolean;
}

export interface PromoCodeIntentClassificationResult extends PromoCodePhaseResult {
  intent?: PromoCodeIntentResult;
  matchedConfig?: PromoCodeConfigurationEntity | null;
}

export interface PromoCodeResolutionResult extends PromoCodePhaseResult {
  responseSent: boolean;
  refundProcessed: boolean;
}
