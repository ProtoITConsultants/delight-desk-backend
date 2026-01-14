import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';

@Injectable()
export class WooCommerceRestApiService {
  constructor(private readonly storeConnectionsRepo: UserStoreConnectionsRepository) {}

  async getOrders(userId: string, perPage: number = 20) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.get('orders', { per_page: perPage });
      return response.data;
    } catch (error) {
      console.error(error);
      return null;
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

      const customersRes = await api.get('customers', {
        email,
        per_page: 1,
      });

      const customer = customersRes.data?.[0];

      if (!customer) {
        return null;
      }

      const ordersRes = await api.get('orders', {
        customer: customer.id,
        per_page: 1,
        orderby: 'date',
        order: 'desc',
      });

      return ordersRes.data?.[0] ?? null;
    } catch (error) {
      throw error;
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
    });
  }
}
