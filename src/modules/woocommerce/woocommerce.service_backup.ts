import { Injectable, InternalServerErrorException } from '@nestjs/common';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { StoreConnectionsRepository } from '../store-connections/store-connections.repository';

@Injectable()
export class WooCommerceService {
  private api: WooCommerceRestApi;

  constructor() {
  const url = process.env.WC_URL;
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!url || !consumerKey || !consumerSecret) {
    throw new Error('WooCommerce environment variables are missing!');
  }

  this.api = new WooCommerceRestApi({
    url,
    consumerKey,
    consumerSecret,
    version: 'wc/v3',
    queryStringAuth: true,
  });
}

  async getProducts() {
    try {
      // const response = await this.api.get('products');
      const response = await this.api.get('products', {
        per_page: 50,       // number of products per page
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async getOrders() {
    try {
      const response = await this.api.get('orders',{
        per_page: 20,
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async getCustomers() {
    try {
      const response = await this.api.get('customers',{
        per_page: 10,
      });
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async createOrder(orderData: any) {
    try {
      const response = await this.api.post('orders', orderData);
      return response.data;
    } catch (error) {
      throw new InternalServerErrorException(error.response?.data || error.message);
    }
  }

  async getOrderById(orderId: number) {
  try {
    const response = await this.api.get(`orders/${orderId}`);
    return response.data;
  } catch (error) {
    throw new InternalServerErrorException(error.response?.data || error.message);
  }
}
}
