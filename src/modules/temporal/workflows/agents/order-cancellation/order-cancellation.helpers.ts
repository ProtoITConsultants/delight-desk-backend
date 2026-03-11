/**
 * Order Cancellation Workflow Helpers
 * Utility functions for order cancellation workflows (runs inside Temporal sandbox)
 */

import { OrderDetails } from '../../types';

interface WooMetaItem {
  key?: string;
  value?: Array<{
    tracking_number?: string;
    tracking_provider?: string;
  }>;
}

interface WooLineItem {
  name: string;
  quantity: number;
  total: string;
}

interface WooOrderInput {
  id: string | number;
  status: string;
  meta_data?: WooMetaItem[];
  billing: {
    first_name: string;
    last_name: string;
    email: string;
  };
  line_items: WooLineItem[];
}

function isWooOrderInput(order: WooOrderInput | OrderDetails): order is WooOrderInput {
  return 'line_items' in order;
}

/**
 * Format WooCommerce order data into standardized OrderDetails
 */
export function formatWooCommerceOrder(order: WooOrderInput | OrderDetails): OrderDetails {
  if (!isWooOrderInput(order)) {
    return order;
  }

  const shipmentTracking = order.meta_data?.find(
    (meta) => meta.key === '_wc_shipment_tracking_items',
  )?.value?.[0];

  return {
    orderId: order.id.toString(),
    status: order.status,
    trackingNumber: shipmentTracking?.tracking_number,
    trackingProvider: shipmentTracking?.tracking_provider,
    customerInfo: {
      name: `${order.billing.first_name} ${order.billing.last_name}`,
      email: order.billing.email,
    },
    items: order.line_items.map((item) => ({
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
