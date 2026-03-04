/**
 * WISMO Workflow Helpers
 * Utility functions for WISMO workflows (runs inside Temporal sandbox)
 */

import { OrderDetails } from '../../types';

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
 * Extract email address from formatted email string.
 * Handles "John Doe <john@example.com>" and plain "john@example.com".
 */
export function extractEmail(fromEmail: string): string {
  const match = fromEmail.match(/<([^>]+)>/);
  return match ? match[1] : fromEmail;
}
