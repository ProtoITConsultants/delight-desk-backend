import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';

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
