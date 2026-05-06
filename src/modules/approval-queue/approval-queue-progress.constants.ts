import { StageBlueprint } from './approval-queue.types';

export const SELF_FULFILLMENT_STAGES: StageBlueprint[] = [
  {
    key: 'identify_order',
    label: 'Identify Order',
    order: 1,
    actionTypes: [
      'mark_email_read',
      'verify_ai_confidence',
      'detect_customer_distress',
      'extract_order_number',
      'request_order_info',
      'fetch_order_details',
    ],
  },
  {
    key: 'check_eligibility',
    label: 'Check Eligibility',
    order: 2,
    actionTypes: ['validate_order_status', 'detect_fulfillment_method', 'check_time_eligibility'],
  },
  {
    key: 'acknowledge_customer',
    label: 'Acknowledge Customer',
    order: 3,
    actionTypes: ['send_acknowledgement'],
  },
  {
    key: 'process_cancellation',
    label: 'Process Cancellation',
    order: 4,
    actionTypes: ['process_cancellation'],
  },
  {
    key: 'process_refund',
    label: 'Process Refund',
    order: 5,
    actionTypes: ['process_refund'],
  },
  {
    key: 'complete_workflow',
    label: 'Complete Workflow',
    order: 6,
    actionTypes: ['send_final_notification'],
  },
];

export const CUSTOM_WAREHOUSE_STAGES: StageBlueprint[] = [
  {
    key: 'identify_order',
    label: 'Identify Order',
    order: 1,
    actionTypes: [
      'mark_email_read',
      'verify_ai_confidence',
      'detect_customer_distress',
      'extract_order_number',
      'request_order_info',
      'fetch_order_details',
    ],
  },
  {
    key: 'check_eligibility',
    label: 'Check Eligibility',
    order: 2,
    actionTypes: [
      'validate_order_status',
      'detect_fulfillment_method',
      'check_time_eligibility',
      'validate_customer_email',
    ],
  },
  {
    key: 'acknowledge_customer',
    label: 'Acknowledge Customer',
    order: 3,
    actionTypes: ['send_acknowledgement'],
  },
  {
    key: 'email_warehouse',
    label: 'Email Warehouse',
    order: 4,
    actionTypes: ['contact_warehouse'],
  },
  {
    key: 'await_warehouse_response',
    label: 'Await Warehouse Response',
    order: 5,
    actionTypes: ['wait_for_warehouse_reply'],
  },
  {
    key: 'process_result',
    label: 'Process Result',
    order: 6,
    actionTypes: ['process_cancellation', 'process_refund', 'send_final_notification'],
  },
];

export const SHIPBOB_STAGES: StageBlueprint[] = [
  {
    key: 'identify_order',
    label: 'Identify Order',
    order: 1,
    actionTypes: [
      'mark_email_read',
      'verify_ai_confidence',
      'detect_customer_distress',
      'extract_order_number',
      'request_order_info',
      'fetch_order_details',
    ],
  },
  {
    key: 'check_eligibility',
    label: 'Check Eligibility',
    order: 2,
    actionTypes: [
      'validate_order_status',
      'detect_fulfillment_method',
      'validate_customer_email',
      'check_time_eligibility',
      'fetch_order_details',
    ],
  },
  {
    key: 'acknowledge_customer',
    label: 'Acknowledge Customer',
    order: 3,
    actionTypes: ['send_acknowledgement'],
  },
  {
    key: 'cancel_in_shipbob',
    label: 'Cancel in ShipBob',
    order: 4,
    actionTypes: ['process_cancellation'],
  },
  {
    key: 'process_refund',
    label: 'Process Refund',
    order: 5,
    actionTypes: ['process_refund'],
  },
  {
    key: 'complete_workflow',
    label: 'Complete Workflow',
    order: 6,
    actionTypes: ['send_final_notification'],
  },
];

export const SHIPSTATION_STAGES: StageBlueprint[] = [
  {
    key: 'identify_order',
    label: 'Identify Order',
    order: 1,
    actionTypes: [
      'mark_email_read',
      'verify_ai_confidence',
      'detect_customer_distress',
      'extract_order_number',
      'request_order_info',
      'fetch_order_details',
    ],
  },
  {
    key: 'check_eligibility',
    label: 'Check Eligibility',
    order: 2,
    actionTypes: [
      'validate_order_status',
      'detect_fulfillment_method',
      'validate_customer_email',
      'check_time_eligibility',
      'fetch_order_details',
    ],
  },
  {
    key: 'acknowledge_customer',
    label: 'Acknowledge Customer',
    order: 3,
    actionTypes: ['send_acknowledgement'],
  },
  {
    key: 'cancel_in_shipstation',
    label: 'Cancel in ShipStation',
    order: 4,
    actionTypes: ['process_cancellation'],
  },
  {
    key: 'process_refund',
    label: 'Process Refund',
    order: 5,
    actionTypes: ['process_refund'],
  },
  {
    key: 'complete_workflow',
    label: 'Complete Workflow',
    order: 6,
    actionTypes: ['send_final_notification'],
  },
];

/**
 * Address Change agent — self / ShipBob / ShipStation fulfillment paths.
 * All three share the same stage structure: they all reach the address change
 * via process_address_change, differing only in the internal provider call
 * inside that action.
 */
export const ADDRESS_CHANGE_SELF_STAGES: StageBlueprint[] = [
  {
    key: 'identify_order',
    label: 'Identify Order',
    order: 1,
    actionTypes: [
      'mark_email_read',
      'verify_ai_confidence',
      'detect_customer_distress',
      'extract_order_number',
      'request_order_info',
    ],
  },
  {
    key: 'check_eligibility',
    label: 'Check Eligibility',
    order: 2,
    actionTypes: ['fetch_order_details', 'validate_order_status'],
  },
  {
    key: 'acknowledge_customer',
    label: 'Acknowledge Customer',
    order: 3,
    actionTypes: ['send_acknowledgement'],
  },
  {
    key: 'update_address',
    label: 'Update Address',
    order: 4,
    actionTypes: ['detect_fulfillment_method', 'extract_address_details', 'process_address_change'],
  },
  {
    key: 'complete_workflow',
    label: 'Complete Workflow',
    order: 5,
    actionTypes: ['send_final_notification'],
  },
];

/**
 * Address Change agent — custom warehouse fulfillment path.
 * The warehouse is contacted via email and the workflow waits for a reply
 * before applying the address change in WooCommerce.
 */
export const ADDRESS_CHANGE_CUSTOM_WAREHOUSE_STAGES: StageBlueprint[] = [
  {
    key: 'identify_order',
    label: 'Identify Order',
    order: 1,
    actionTypes: [
      'mark_email_read',
      'verify_ai_confidence',
      'detect_customer_distress',
      'extract_order_number',
      'request_order_info',
    ],
  },
  {
    key: 'check_eligibility',
    label: 'Check Eligibility',
    order: 2,
    actionTypes: ['fetch_order_details', 'validate_order_status'],
  },
  {
    key: 'acknowledge_customer',
    label: 'Acknowledge Customer',
    order: 3,
    actionTypes: ['send_acknowledgement'],
  },
  {
    key: 'extract_address',
    label: 'Extract Address',
    order: 4,
    actionTypes: ['detect_fulfillment_method', 'extract_address_details'],
  },
  {
    key: 'contact_warehouse',
    label: 'Contact Warehouse',
    order: 5,
    actionTypes: ['contact_warehouse'],
  },
  {
    key: 'await_warehouse_response',
    label: 'Await Warehouse Response',
    order: 6,
    actionTypes: ['wait_for_warehouse_reply'],
  },
  {
    key: 'complete_workflow',
    label: 'Complete Workflow',
    order: 7,
    actionTypes: ['send_final_notification'],
  },
];
