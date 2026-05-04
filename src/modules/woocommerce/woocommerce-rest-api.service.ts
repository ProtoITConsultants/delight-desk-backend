import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';

/**
 * Mirrors the subset of WooCommerce REST coupon properties the Delight Desk Promo Code
 * Agent uses to keep WC coupons aligned with promo configurations. Marked partial because
 * syncOne routinely sends only the fields that meaningfully changed.
 */
export interface WooCommerceCouponPayload {
  code?: string;
  discount_type?: 'percent' | 'fixed_cart' | 'fixed_product';
  amount?: string;
  description?: string;
  date_expires?: string | null;
  individual_use?: boolean;
  exclude_sale_items?: boolean;
  minimum_amount?: string;
  maximum_amount?: string;
  email_restrictions?: string[];
  usage_limit?: number | null;
  usage_limit_per_user?: number | null;
  limit_usage_to_x_items?: number | null;
  free_shipping?: boolean;
  product_ids?: number[];
  excluded_product_ids?: number[];
  product_categories?: number[];
  excluded_product_categories?: number[];
  meta_data?: Array<{ key: string; value: string | number | boolean }>;
}

@Injectable()
export class WooCommerceRestApiService {
  constructor(private readonly storeConnectionsRepo: UserStoreConnectionsRepository) {}

  async getOrders(
    userId: string,
    options: { status?: string; page?: number; perPage?: number } = {},
  ) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const { status, page = 1, perPage = 20 } = options;
      const params: Record<string, string | number> = {
        page,
        per_page: perPage,
        orderby: 'date',
        order: 'desc',
      };
      if (status) {
        params.status = status;
      }
      const response = await api.get('orders', params);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  async getOrderById(userId: string, orderId: string) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.get(`orders/${orderId}`);
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async getMostRecentOrderByEmail(userId: string, email: string) {
    try {
      const api = await this.initWooCommerceClient(userId);

      const response = await api.get('orders', {
        customer_email: email,
        per_page: 1,
        orderby: 'date',
        order: 'desc',
      });

      const order = response.data?.[0];

      // Validate that the returned order actually matches the requested email
      // WooCommerce may return orders even when the email filter doesn't match
      if (order && order.billing?.email?.toLowerCase() !== email.toLowerCase()) {
        return null;
      }

      return order ?? null;
    } catch (error) {
      // Log error and return null to allow workflow to continue to Action 3.1
      // This handles timeouts, network errors, and other API failures gracefully
      console.error('Error fetching most recent order by email:', {
        email,
        error: error.message,
        code: error.code,
      });
      return null;
    }
  }

  async updateOrderStatus(userId: string, orderId: string, status: string) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.put(`orders/${orderId}`, {
        status,
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async updateOrderShippingAddress(
    userId: string,
    orderId: string,
    shipping: {
      first_name?: string;
      last_name?: string;
      company?: string;
      address_1: string;
      address_2?: string;
      city: string;
      state?: string;
      postcode: string;
      country: string;
      phone?: string;
    },
  ) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.put(`orders/${orderId}`, {
        shipping,
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async listCoupons(
    userId: string,
    options: {
      code?: string;
      page?: number;
      perPage?: number;
      orderby?: 'date' | 'modified' | 'id' | 'title' | 'slug';
      order?: 'asc' | 'desc';
    } = {},
  ) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const { code, page = 1, perPage = 20, orderby, order } = options;
      const params: Record<string, string | number> = { page, per_page: perPage };
      if (code) params.code = code;
      if (orderby) params.orderby = orderby;
      if (order) params.order = order;
      const response = await api.get('coupons', params);
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  /**
   * Iterates every coupon on the merchant's WooCommerce store, page by page, and
   * yields raw coupon objects to the supplied callback. Returns when WooCommerce
   * returns an empty page.
   *
   * The async iterator pattern keeps memory bounded for stores with thousands of
   * coupons (we never hold the full list in RAM) and lets the caller short-circuit
   * by throwing inside `onCoupon`.
   *
   * Throttles between pages to stay polite with hosts that impose undocumented rate
   * limits (Kinsta, WP Engine, Cloudways have all been seen to throttle in the wild).
   */
  async iterateAllCoupons(
    userId: string,
    onCoupon: (coupon: any) => Promise<void> | void,
    options: { perPage?: number; throttleMs?: number } = {},
  ): Promise<{ pagesFetched: number; couponsSeen: number }> {
    const perPage = Math.min(options.perPage ?? 100, 100);
    const throttleMs = options.throttleMs ?? 200;

    let page = 1;
    let pagesFetched = 0;
    let couponsSeen = 0;

    while (true) {
      const coupons: any[] = await this.listCoupons(userId, {
        page,
        perPage,
        orderby: 'date',
        order: 'desc',
      });
      pagesFetched += 1;

      if (!Array.isArray(coupons) || coupons.length === 0) break;

      for (const coupon of coupons) {
        couponsSeen += 1;
        await onCoupon(coupon);
      }

      if (coupons.length < perPage) break;
      page += 1;
      if (throttleMs > 0) await new Promise((resolve) => setTimeout(resolve, throttleMs));
    }

    return { pagesFetched, couponsSeen };
  }

  /**
   * Fetches a single coupon by its WooCommerce id. Used by the Promo Code Agent's
   * eligibility check to read the live `product_ids` / `excluded_product_ids` set
   * at refund time — that way the agent reflects any merchant edits made in WP
   * admin since the coupon was last synced into Delight Desk.
   */
  async getCouponById(userId: string, couponId: number) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.get(`coupons/${couponId}`);
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async findCouponByCode(userId: string, code: string) {
    const coupons = await this.listCoupons(userId, { code, perPage: 1 });
    const match = coupons?.[0];
    if (!match) return null;
    if ((match.code || '').toLowerCase() !== code.toLowerCase()) return null;
    return match;
  }

  async createCoupon(userId: string, payload: WooCommerceCouponPayload) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.post('coupons', payload);
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async updateCoupon(userId: string, couponId: number, payload: WooCommerceCouponPayload) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.put(`coupons/${couponId}`, payload);
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async deleteCoupon(userId: string, couponId: number, force: boolean = true) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.delete(`coupons/${couponId}`, { force });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  /**
   * Registers a webhook on the merchant's WooCommerce store. Returns the WC-assigned
   * numeric webhook id that we persist so we can delete the registration later.
   *
   * `secret` is the per-user random string WooCommerce will use to HMAC-sign every
   * delivery; we verify that signature on receipt to confirm the event came from
   * the configured store and not a forged request.
   */
  async createWebhook(
    userId: string,
    payload: {
      topic: string;
      delivery_url: string;
      secret: string;
      name?: string;
      status?: 'active' | 'paused' | 'disabled';
    },
  ) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.post('webhooks', {
        name: payload.name ?? `Delight Desk – ${payload.topic}`,
        topic: payload.topic,
        delivery_url: payload.delivery_url,
        secret: payload.secret,
        status: payload.status ?? 'active',
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async deleteWebhook(userId: string, webhookId: number, force: boolean = true) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.delete(`webhooks/${webhookId}`, { force });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async createOrderRefund(
    userId: string,
    orderId: string,
    payload: {
      amount?: string;
      reason?: string;
      apiRefund?: boolean;
      restockRefundedItems?: boolean;
      lineItems?: Array<{
        id: number | string;
        quantity?: number;
        refund_total?: string;
      }>;
    } = {},
  ) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.post(`orders/${orderId}/refunds`, {
        amount: payload.amount,
        reason: payload.reason,
        api_refund: payload.apiRefund ?? true,
        restock_refunded_items: payload.restockRefundedItems ?? true,
        line_items: payload.lineItems,
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  private async initWooCommerceClient(userId: string) {
    const connection = await this.storeConnectionsRepo.findByPlatform(userId, 'woocommerce');

    if (!connection) {
      throw new NotFoundException('WooCommerce store connection not found for this user');
    }

    const { storeUrl, apiKey, apiSecret } = connection;

    if (!apiKey || !apiSecret || !storeUrl) {
      throw new NotFoundException('WooCommerce API credentials are incomplete');
    }

    return new WooCommerceRestApi({
      url: storeUrl,
      consumerKey: apiKey,
      consumerSecret: apiSecret,
      version: 'wc/v3',
      timeout: 30000, // 30 second timeout for API requests
    });
  }
}
