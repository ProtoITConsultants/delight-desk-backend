export type FulfillmentMethod = 'self' | 'custom_warehouse' | 'shipstation' | 'shipbob';

export function toCurrencyString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0) {
    return null;
  }
  return numeric.toFixed(2);
}

export function resolveRefundAmount(order: any): string | null {
  const total = Number(order?.total);
  if (Number.isNaN(total)) {
    return null;
  }

  const totalRefunded = Number(order?.total_refunded ?? 0);
  const remaining = Math.max(total - (Number.isNaN(totalRefunded) ? 0 : totalRefunded), 0);

  if (remaining === 0) {
    return null;
  }

  return remaining.toFixed(2);
}
