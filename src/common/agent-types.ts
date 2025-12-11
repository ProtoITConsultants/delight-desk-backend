export const AgentTypes = {
  WISMO: 'wismo',
  SUBSCRIPTION: 'subscription',
  PRODUCT: 'product',
  RETURNS: 'returns',
  PROMO_CODE: 'promo_code',
  ADDRESS_CHANGE: 'address_change',
  ORDER_CANCELLATION: 'order_cancellation',
} as const;

export type AgentType = (typeof AgentTypes)[keyof typeof AgentTypes];
