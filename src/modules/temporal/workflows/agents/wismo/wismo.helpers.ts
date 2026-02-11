/**
 * WISMO Workflow Helpers
 * Shared utility functions for WISMO workflows
 */

import { OrderDetails } from '../../../types';

/**
 * Format WooCommerce order data into standardized OrderDetails
 */
export function formatWooCommerceOrder(order: any): OrderDetails {
  return {
    orderId: order.id.toString(),
    status: order.status,
    trackingNumber: order.meta_data?.find((m: any) => m.key === '_wc_shipment_tracking_items')
      ?.value[0]?.['tracking_number'],
    trackingProvider: order.meta_data?.find((m: any) => m.key === '_wc_shipment_tracking_items')
      ?.value[0]?.['tracking_provider'],
    customerInfo: {
      name: `${order.billing.first_name} ${order.billing.last_name}`,
      email: order.billing.email,
    },
    items: order.line_items.map((item: any) => ({
      name: item.name,
      quantity: item.quantity,
      total: item.total,
    })),
  };
}

/**
 * Extract email address from formatted email string
 * Handles formats like: "John Doe <john@example.com>" or "john@example.com"
 */
export function extractEmail(fromEmail: string): string | null {
  const match = fromEmail.match(/<([^>]+)>/);
  return match ? match[1] : null;
}

/**
 * Extract customer name from email string
 * Falls back to email prefix if name not available
 */
export function extractCustomerName(fromEmail: string): string {
  // Try to extract name before email
  const nameMatch = fromEmail.match(/^([^<]+)</);
  if (nameMatch) {
    return nameMatch[1].trim();
  }

  // Fallback to email prefix
  const email = extractEmail(fromEmail) || fromEmail;
  return email.split('@')[0];
}
