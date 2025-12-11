import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';

@Injectable()
export class WooCommerceRestApiService {
  constructor(private readonly storeConnectionsRepo: UserStoreConnectionsRepository) {}

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

  async getProducts(userId: string) {
    try {
      const api = await this.initWooCommerceClient(userId);
      const response = await api.get('products', { per_page: 50 });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

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
