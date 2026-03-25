import { EmailEntity } from '../../../../../database/schema';
import { EscalationDetails, OrderDetails, OrderExtractionResult, WorkflowState } from '../../types';

export interface AddressChangeOrderDetection extends Partial<OrderExtractionResult> {}

export interface RequestedShippingAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  phone?: string;
  confidence?: number;
}

export interface AddressChangeWorkflowState extends WorkflowState {
  orderNumber?: string;
  wooOrder?: OrderDetails;
  fulfillmentMethod?: 'self' | 'custom_warehouse' | 'shipstation' | 'shipbob';
  requestedAddress?: RequestedShippingAddress;
  warehouseEmail?: string;
  awaitingWarehouseReply?: boolean;
  warehouseReplyEmail?: EmailEntity;
  customerReply?: string;
  customerReplyEmail?: EmailEntity;
  awaitingCustomerReply?: boolean;
  latestCustomerMessageBody?: string;
}

export interface AddressChangePhaseResult {
  success: boolean;
  state: AddressChangeWorkflowState;
  escalation?: EscalationDetails;
}

export interface PreparationResult extends AddressChangePhaseResult {
  emailMarkedAsRead: boolean;
  confidenceVerified: boolean;
}

export interface OrderDiscoveryResult extends AddressChangePhaseResult {
  orderNumber?: string;
  requiredCustomerInteraction: boolean;
  customerReplied?: boolean;
  orderDetection?: AddressChangeOrderDetection;
}

export interface OrderProcessingResult extends AddressChangePhaseResult {
  orderFetched: boolean;
  acknowledgementSent: boolean;
}

export interface FulfillmentExecutionResult extends AddressChangePhaseResult {
  fulfillmentMethod: 'self' | 'custom_warehouse' | 'shipstation' | 'shipbob';
  addressDetected: boolean;
  addressUpdated: boolean;
  confirmationSent: boolean;
}
