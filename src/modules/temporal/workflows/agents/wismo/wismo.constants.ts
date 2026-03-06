/**
 * WISMO Workflow Constants
 * Centralized configuration for the WISMO workflow
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

// Tracking retry configuration
export const MAX_TRACKING_RETRIES_IN_DAYS = 7;
export const TRACKING_RETRY_INTERVAL = '2 hours';

// Status monitoring configuration
export const STATUS_CHECK_INTERVAL = '2 hours';

// Customer reply wait configuration
export const MAX_CUSTOMER_REPLY_WAIT_DAYS = 2;

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
  WISMO_ORDER: {
    startToCloseTimeout: '5 minutes',
    retry: {
      initialInterval: '10s',
      maximumAttempts: 3,
    },
  },
  WISMO_TRACKING: {
    startToCloseTimeout: '3 minutes',
    retry: {
      initialInterval: '10s',
      maximumAttempts: 3,
    },
  },
  WISMO_MESSAGE: {
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
