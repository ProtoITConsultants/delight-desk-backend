import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { UserStoreConnectionsRepository } from '../woocommerce-oauth/user-store-connections.repository';

@Injectable()
export class WooCommerceService {
  constructor(private readonly storeConnectionsRepo: UserStoreConnectionsRepository) {}

  private async initWooCommerceClient(userId: string) {
    const connection = await this.storeConnectionsRepo.findByPlatform(userId, 'woocommerce');

    if (!connection) {
      throw new NotFoundException('WooCommerce store connection not found for this user');
    }

    const { storeUrl, apiKey, apiSecret, connectionMethod } = connection;

    if (!storeUrl) {
      throw new NotFoundException('WooCommerce store URL is missing');
    }

    if (connectionMethod === 'apiKey') {
      if (!apiKey || !apiSecret) {
        throw new NotFoundException('WooCommerce API credentials are incomplete');
      }

      return new WooCommerceRestApi({
        url: storeUrl,
        consumerKey: apiKey,
        consumerSecret: apiSecret,
        version: 'wc/v3',
        queryStringAuth: true,
      });
    }

    throw new NotFoundException(`Invalid connection method: ${connectionMethod}`);
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
