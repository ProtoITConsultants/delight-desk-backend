/**
 * Order Cancellation Agent Constants
 * Centralized configuration for timeouts, intervals, and thresholds
 */

// AI Classification
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 70;

// Time-based Eligibility
export const STANDARD_CANCELLATION_WINDOW_HOURS = 24;
export const FRIDAY_CUTOFF_HOUR_UTC = 12; // 12:00 PM UTC
export const WEEKEND_EXTENSION_END_HOUR_UTC = 12; // Monday 12:00 PM UTC

// Duplicate Detection and Rate Limiting
export const DUPLICATE_DETECTION_WINDOW_HOURS = 1;
export const RATE_LIMIT_WINDOW_HOURS = 24;
export const RATE_LIMIT_MAX_REQUESTS = 5;

// Customer Reply Timeouts
export const CUSTOMER_REPLY_CHECK_INTERVAL = '10 minutes';
export const MAX_CUSTOMER_REPLY_WAIT_DAYS = 3;

// Warehouse Email Timeouts
export const WAREHOUSE_REPLY_CHECK_INTERVAL = '10 minutes';
export const WAREHOUSE_REPLY_TIMEOUT_HOURS = 8;

// Order Status Validation
export const CANCELLABLE_ORDER_STATUSES = ['processing', 'pending', 'on-hold', 'pending payment'];

export const NON_CANCELLABLE_ORDER_STATUSES = [
  'completed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'failed',
];

// Fulfillment Methods
export enum FulfillmentMethod {
  WAREHOUSE_EMAIL = 'WAREHOUSE_EMAIL',
  SHIPBOB = 'SHIPBOB',
  SHIPSTATION = 'SHIPSTATION',
  SELF_FULFILLMENT = 'SELF_FULFILLMENT',
}

// Activity Timeouts
export const ACTIVITY_TIMEOUTS = {
  markEmailAsRead: '1 minute',
  aiIdentity: '1 minute',
  fetchOrder: '3 minutes',
  checkDuplicate: '1 minute',
  checkRateLimit: '1 minute',
  recordRequest: '1 minute',
  updateRequestStatus: '1 minute',
  validateEmail: '1 minute',
  sendEmail: '3 minutes',
  checkEmailReply: '2 minutes',
  cancelOrder: '5 minutes',
  processRefund: '5 minutes',
  cancelShipBob: '5 minutes',
  cancelShipStation: '5 minutes',
};

// Retry Policies
export const RETRY_POLICIES = {
  standard: {
    initialInterval: '10s',
    maximumAttempts: 3,
    backoffCoefficient: 2,
  },
  extended: {
    initialInterval: '30s',
    maximumAttempts: 5,
    backoffCoefficient: 2,
  },
  critical: {
    initialInterval: '1m',
    maximumAttempts: 10,
    backoffCoefficient: 2,
  },
};

// Message Templates
export const MESSAGE_PREFIXES = {
  urgentWarehouse: '[URGENT - ACTION REQUIRED]',
  testMode: '[TEST MODE]',
};

// Warehouse Email Keywords
export const WAREHOUSE_KEYWORDS = {
  canceled: ['canceled', 'cancelled', 'done', 'confirmed', 'yes'],
  cannotCancel: ['cannot cancel', 'already shipped', 'shipped', 'no', 'too late'],
};
