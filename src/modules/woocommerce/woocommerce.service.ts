import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { StoreConnectionsRepository } from '../store-connections/store-connections.repository';

@Injectable()
export class WooCommerceService {
  constructor(private readonly storeConnectionsRepo: StoreConnectionsRepository) {}

  private async initWooCommerceClient(userId: string) {
    const connection = await this.storeConnectionsRepo.findByPlatform(userId, 'woocommerce');

    if (!connection) {
      throw new NotFoundException('WooCommerce store connection not found for this user');
    }

    const { store_url, api_key, api_secret, oauth_token, oauth_token_secret, connection_method } =
      connection;

    if (!store_url) {
      throw new NotFoundException('WooCommerce store URL is missing');
    }

    // ✅ Handle API Key authentication
    if (connection_method === 'api_key') {
      if (!api_key || !api_secret) {
        throw new NotFoundException('WooCommerce API credentials are incomplete');
      }

      return new WooCommerceRestApi({
        url: store_url,
        consumerKey: api_key,
        consumerSecret: api_secret,
        version: 'wc/v3',
        queryStringAuth: true,
      });
    }

    // ✅ Handle OAuth authentication
    if (connection_method === 'oauth') {
      if (!oauth_token || !oauth_token_secret) {
        throw new NotFoundException('WooCommerce OAuth credentials are incomplete');
      }

      // For WooCommerce OAuth 1.0a, use the same library
      return new WooCommerceRestApi({
        url: store_url,
        consumerKey: oauth_token,
        consumerSecret: oauth_token_secret,
        version: 'wc/v3',
        queryStringAuth: true,
      });
    }

    throw new NotFoundException(`Invalid connection method: ${connection_method}`);
  }
  async getProducts(userId: string) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.get('products', { per_page: 50 });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async getOrders(userId: string) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.get('orders', { per_page: 20 });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async getCustomers(userId: string) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.get('customers', { per_page: 10 });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async createOrder(userId: string, orderData: any) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.post('orders', orderData);
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async getOrderById(userId: string, orderId: number) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.get(`orders/${orderId}`);
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }
}
