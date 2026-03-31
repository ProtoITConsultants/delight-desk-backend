import { ActionExecutionResult, EscalationDetails } from '../../../types';
import { ProductWorkflowState } from '../product.types';

interface ProductActionFailureResult {
  success: false;
  state: ProductWorkflowState;
  escalation?: EscalationDetails;
}

export function buildProductFailureResult(
  state: ProductWorkflowState,
  actionResult: ActionExecutionResult,
): ProductActionFailureResult | null {
  if (actionResult.success) {
    return null;
  }

  if (actionResult.escalation) {
    state.status = 'escalated';
    state.escalation = {
      type: actionResult.escalation.type,
      reason: actionResult.escalation.reason,
      timestamp: new Date(),
    };
    return {
      success: false,
      state,
      escalation: actionResult.escalation,
    };
  }

  state.status = 'cancelled';
  return {
    success: false,
    state,
  };
}
