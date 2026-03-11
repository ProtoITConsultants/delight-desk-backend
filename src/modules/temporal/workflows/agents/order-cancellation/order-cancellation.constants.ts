/**
 * Order Cancellation Workflow Constants
 * Centralized configuration for the Order Cancellation workflow
 */

// Classification thresholds
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 60;

// Customer distress escalation configuration
export const CUSTOMER_DISTRESS_ESCALATION_SCORE_THRESHOLD = 3;
export const CUSTOMER_DISTRESS_SIGNAL_WEIGHTS = {
  PRIORITY_URGENT: 2,
  PRIORITY_HIGH: 1,
  NEGATIVE_SENTIMENT: 1,
  FRUSTRATION_KEYWORD: 1,
  URGENCY_KEYWORD: 1,
  REPEAT_REQUEST_KEYWORD: 1,
} as const;
export const CUSTOMER_DISTRESS_FRUSTRATION_KEYWORDS = [
  'frustrated',
  'angry',
  'upset',
  'disappointed',
  'unacceptable',
] as const;
export const CUSTOMER_DISTRESS_URGENCY_KEYWORDS = [
  'asap',
  'urgent',
  'immediately',
  'right now',
  'as soon as possible',
] as const;
export const CUSTOMER_DISTRESS_REPEAT_REQUEST_KEYWORDS = [
  'how many times',
  'again',
  'still waiting',
  'already asked',
  'for the third time',
] as const;

// Customer reply wait configuration
export const MAX_CUSTOMER_REPLY_WAIT_DAYS = 2;
export const REFUND_TIMELINE_BUSINESS_DAYS = '3 - 5 business days';
export const CUSTOM_WAREHOUSE_REPLY_TIMEOUT_HOURS = 8;
export const CANCELLATION_STANDARD_WINDOW_HOURS = 24;
export const SELF_FULFILLMENT_ELIGIBLE_STATUSES = ['pending', 'processing'] as const;
export const SELF_FULFILLMENT_NON_ELIGIBLE_STATUSES = ['shipped', 'completed'] as const;

// Activity timeout configurations
export const ACTIVITY_TIMEOUTS = {
  EMAIL: {
    startToCloseTimeout: '2 minutes',
    retry: {
      initialInterval: '10s',
      maximumAttempts: 3,
    },
  },
  AI_IDENTITY: {
    startToCloseTimeout: '30 seconds',
    retry: {
      initialInterval: '5s',
      maximumAttempts: 3,
    },
  },
  ORDER: {
    startToCloseTimeout: '5 minutes',
    retry: {
      initialInterval: '10s',
      maximumAttempts: 3,
    },
  },
  MESSAGE: {
    startToCloseTimeout: '2 minutes',
    retry: {
      initialInterval: '10s',
      maximumAttempts: 3,
    },
  },
  APPROVAL_QUEUE: {
    startToCloseTimeout: '1 minute',
  },
} as const;
