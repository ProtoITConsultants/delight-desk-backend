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

export function extractEmail(fromEmail: string): string {
  const match = fromEmail.match(/<([^>]+)>/);
  return match ? match[1] : fromEmail;
}

export function formatAddressForMessage(address: {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}): string {
  const line1Parts = [address.firstName, address.lastName].filter(Boolean).join(' ').trim();
  const line2 = [address.company, address.address1].filter(Boolean).join(', ').trim();
  const line3 = [address.address2, address.city, address.state, address.postalCode]
    .filter(Boolean)
    .join(', ')
    .trim();
  const line4 = address.country || '';

  return [line1Parts, line2, line3, line4].filter(Boolean).join(' | ');
}
