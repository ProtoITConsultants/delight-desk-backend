import {
  TimeEligibilityResult,
  OrderStatusValidationResult,
  WarehouseReplyResult,
} from './order-cancellation.types';
import {
  STANDARD_CANCELLATION_WINDOW_HOURS,
  FRIDAY_CUTOFF_HOUR_UTC,
  WEEKEND_EXTENSION_END_HOUR_UTC,
  CANCELLABLE_ORDER_STATUSES,
  NON_CANCELLABLE_ORDER_STATUSES,
  WAREHOUSE_KEYWORDS,
} from './order-cancellation.constants';

/**
 * Check time-based eligibility for order cancellation
 * Rules:
 * - Standard: 24 hours from order creation
 * - Friday after 12 PM UTC: Until Monday 12 PM UTC
 * - Weekend orders: Until Monday 12 PM UTC
 * - Proceed if uncertain policy: Always return eligible=true, but include reason
 */
export function checkTimeEligibility(orderCreatedAt: Date | string): TimeEligibilityResult {
  const now = new Date();
  const orderDate = new Date(orderCreatedAt);
  const timeDiff = now.getTime() - orderDate.getTime();
  const hoursSinceOrder = timeDiff / (1000 * 60 * 60);

  // Standard 24-hour window
  if (hoursSinceOrder <= STANDARD_CANCELLATION_WINDOW_HOURS) {
    return {
      eligible: true,
      reason: 'Within 24-hour cancellation window',
      orderCreatedAt: orderDate,
      currentTime: now,
      hoursSinceOrder,
      extendedWindow: false,
    };
  }

  // Check for Friday afternoon extension
  const dayOfWeek = orderDate.getUTCDay(); // 0 = Sunday, 5 = Friday
  const hourOfDay = orderDate.getUTCHours();

  if (dayOfWeek === 5 && hourOfDay >= FRIDAY_CUTOFF_HOUR_UTC) {
    // Friday after 12 PM UTC - eligible until Monday 12 PM UTC
    const monday12PM = getNextMonday12PM(orderDate);

    if (now <= monday12PM) {
      return {
        eligible: true,
        reason: 'Friday afternoon order - eligible until Monday 12:00 PM UTC',
        orderCreatedAt: orderDate,
        currentTime: now,
        hoursSinceOrder,
        extendedWindow: true,
      };
    }
  }

  // Check for weekend orders
  if (dayOfWeek === 6 || dayOfWeek === 0) {
    // Saturday or Sunday
    const monday12PM = getNextMonday12PM(orderDate);

    if (now <= monday12PM) {
      return {
        eligible: true,
        reason: `Weekend order - eligible until Monday 12:00 PM UTC`,
        orderCreatedAt: orderDate,
        currentTime: now,
        hoursSinceOrder,
        extendedWindow: true,
      };
    }
  }

  // "Proceed if uncertain" policy - still attempt cancellation
  return {
    eligible: true,
    reason: 'Outside standard window - proceeding per "proceed if uncertain" policy',
    orderCreatedAt: orderDate,
    currentTime: now,
    hoursSinceOrder,
    extendedWindow: false,
  };
}

/**
 * Calculate next Monday 12:00 PM UTC from a given date
 */
export function getNextMonday12PM(fromDate: Date): Date {
  const date = new Date(fromDate);
  const dayOfWeek = date.getUTCDay();

  // Calculate days until Monday (1)
  let daysUntilMonday: number;
  if (dayOfWeek === 0) {
    // Sunday
    daysUntilMonday = 1;
  } else if (dayOfWeek === 6) {
    // Saturday
    daysUntilMonday = 2;
  } else {
    // Friday
    daysUntilMonday = 3;
  }

  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() + daysUntilMonday);
  monday.setUTCHours(WEEKEND_EXTENSION_END_HOUR_UTC, 0, 0, 0);

  return monday;
}

/**
 * Validate if order status allows cancellation
 */
export function validateOrderStatus(orderStatus: string): OrderStatusValidationResult {
  const normalizedStatus = orderStatus.toLowerCase().trim();

  // Check if order is in non-cancellable status
  if (NON_CANCELLABLE_ORDER_STATUSES.includes(normalizedStatus)) {
    return {
      valid: false,
      reason: `Order has already been processed (status: ${orderStatus})`,
      orderStatus,
      canProceed: false,
    };
  }

  // Check if order is in explicitly cancellable status
  if (CANCELLABLE_ORDER_STATUSES.includes(normalizedStatus)) {
    return {
      valid: true,
      reason: 'Order status allows cancellation',
      orderStatus,
      canProceed: true,
    };
  }

  // Unknown status - proceed with caution
  return {
    valid: true,
    reason: `Unknown order status (${orderStatus}) - proceeding with cancellation attempt`,
    orderStatus,
    canProceed: true,
  };
}

/**
 * Extract email address from "Name <email@example.com>" format
 */
export function extractEmail(fromEmail: string): string | null {
  if (!fromEmail) return null;

  // Check if email is in "Name <email>" format
  const match = fromEmail.match(/<(.+?)>/);
  if (match) {
    return match[1].toLowerCase().trim();
  }

  // Check if it's already just an email
  if (fromEmail.includes('@')) {
    return fromEmail.toLowerCase().trim();
  }

  return null;
}

/**
 * Normalize email for comparison
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Parse warehouse reply email for cancellation confirmation
 */
export function parseWarehouseReply(emailBody: string): WarehouseReplyResult {
  if (!emailBody) {
    return {
      hasReply: false,
    };
  }

  const normalizedBody = emailBody.toLowerCase();

  // Check for "canceled" keywords
  const canceled = WAREHOUSE_KEYWORDS.canceled.some((keyword) =>
    normalizedBody.includes(keyword),
  );

  // Check for "cannot cancel" keywords
  const cannotCancel = WAREHOUSE_KEYWORDS.cannotCancel.some((keyword) =>
    normalizedBody.includes(keyword),
  );

  // If both or neither are present, it's ambiguous
  if ((canceled && cannotCancel) || (!canceled && !cannotCancel)) {
    return {
      hasReply: true,
      uncertainty: true,
      body: emailBody,
    };
  }

  return {
    hasReply: true,
    canceled: canceled,
    cannotCancel: cannotCancel,
    body: emailBody,
    uncertainty: false,
  };
}

/**
 * Format WooCommerce order for logging and display
 */
export function formatOrderSummary(order: any): string {
  return `Order #${order.number} - ${order.status} - $${order.total} - ${order.billing?.email || 'N/A'}`;
}

/**
 * Calculate hours until deadline for extended window
 */
export function calculateHoursUntilDeadline(orderCreatedAt: Date | string): number {
  const orderDate = new Date(orderCreatedAt);
  const dayOfWeek = orderDate.getUTCDay();
  const hourOfDay = orderDate.getUTCHours();

  // Friday after 12 PM or weekend - calculate until Monday 12 PM
  if (
    (dayOfWeek === 5 && hourOfDay >= FRIDAY_CUTOFF_HOUR_UTC) ||
    dayOfWeek === 6 ||
    dayOfWeek === 0
  ) {
    const monday12PM = getNextMonday12PM(orderDate);
    const now = new Date();
    const hoursRemaining = (monday12PM.getTime() - now.getTime()) / (1000 * 60 * 60);
    return Math.max(0, hoursRemaining);
  }

  // Standard 24-hour window
  const now = new Date();
  const hoursSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
  const hoursRemaining = STANDARD_CANCELLATION_WINDOW_HOURS - hoursSinceOrder;

  return Math.max(0, hoursRemaining);
}
