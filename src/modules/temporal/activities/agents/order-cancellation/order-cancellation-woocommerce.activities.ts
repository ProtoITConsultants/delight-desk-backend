import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type AxiosInstance = ReturnType<typeof axios.create>;

/**
 * Order Cancellation WooCommerce Activities
 * Handles WooCommerce API operations for order cancellation
 */
@Injectable()
@Activity()
export class OrderCancellationWooCommerceActivities {
  private readonly logger = new Logger(OrderCancellationWooCommerceActivities.name);
  private axiosInstances: Map<string, AxiosInstance> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get or create WooCommerce axios instance for a user
   */
  private getWooCommerceClient(userId: string): AxiosInstance {
    if (this.axiosInstances.has(userId)) {
      return this.axiosInstances.get(userId)!;
    }

    // In production, fetch user's WooCommerce credentials from database
    // For now, using environment variables
    const wooCommerceUrl = this.configService.get<string>('WOOCOMMERCE_URL');
    const consumerKey = this.configService.get<string>('WOOCOMMERCE_CONSUMER_KEY');
    const consumerSecret = this.configService.get<string>('WOOCOMMERCE_CONSUMER_SECRET');

    const client = axios.create({
      baseURL: `${wooCommerceUrl}/wp-json/wc/v3`,
      auth: {
        username: consumerKey || '',
        password: consumerSecret || '',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstances.set(userId, client);
    return client;
  }

  /**
   * Cancel order in WooCommerce
   * Updates order status to 'cancelled'
   * @param userId - User ID
   * @param orderNumber - WooCommerce order number
   * @returns Updated order details
   */
  @ActivityMethod({ name: 'cancelWooCommerceOrder' })
  async cancelWooCommerceOrder(userId: string, orderNumber: string): Promise<any> {
    try {
      this.logger.log(`Cancelling WooCommerce order: ${orderNumber} for user: ${userId}`);

      const client = this.getWooCommerceClient(userId);

      // Update order status to cancelled
      const response = await client.put<any>(`/orders/${orderNumber}`, {
        status: 'cancelled',
      });

      this.logger.log(`WooCommerce order cancelled: ${orderNumber}`, {
        orderId: response.data.id,
        status: response.data.status,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to cancel WooCommerce order: ${orderNumber}`, {
        error: error.message,
        userId,
      });
      throw error;
    }
  }

  /**
   * Process refund for a WooCommerce order
   * @param userId - User ID
   * @param orderNumber - WooCommerce order number
   * @param amount - Refund amount (optional, defaults to full refund)
   * @param reason - Refund reason
   * @returns Refund details
   */
  @ActivityMethod({ name: 'processWooCommerceRefund' })
  async processWooCommerceRefund(
    userId: string,
    orderNumber: string,
    amount?: number,
    reason?: string,
  ): Promise<any> {
    try {
      this.logger.log(`Processing refund for WooCommerce order: ${orderNumber}`, {
        userId,
        amount,
        reason,
      });

      const client = this.getWooCommerceClient(userId);

      // Get order details to determine refund amount if not provided
      if (!amount) {
        const orderResponse = await client.get<any>(`/orders/${orderNumber}`);
        amount = parseFloat(orderResponse.data.total);
      }

      // Create refund
      const refundData: any = {
        amount: amount.toString(),
        reason: reason || 'Order cancelled by customer',
      };

      const response = await client.post<any>(`/orders/${orderNumber}/refunds`, refundData);

      this.logger.log(`WooCommerce refund processed for order: ${orderNumber}`, {
        refundId: response.data.id,
        amount: response.data.total,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to process WooCommerce refund for order: ${orderNumber}`, {
        error: error.message,
        userId,
        amount,
      });
      throw error;
    }
  }

  /**
   * Cancel order and process refund in one operation
   * @param userId - User ID
   * @param orderNumber - WooCommerce order number
   * @param refundReason - Reason for refund
   * @returns Result with order and refund details
   */
  @ActivityMethod({ name: 'cancelAndRefundWooCommerceOrder' })
  async cancelAndRefundWooCommerceOrder(
    userId: string,
    orderNumber: string,
    refundReason?: string,
  ): Promise<{ order: any; refund: any }> {
    try {
      this.logger.log(`Cancelling and refunding WooCommerce order: ${orderNumber}`, {
        userId,
      });

      // First, process the refund
      const refund = await this.processWooCommerceRefund(
        userId,
        orderNumber,
        undefined,
        refundReason || 'Order cancelled by customer',
      );

      // Then, cancel the order
      const order = await this.cancelWooCommerceOrder(userId, orderNumber);

      this.logger.log(`WooCommerce order cancelled and refunded: ${orderNumber}`, {
        orderId: order.id,
        refundId: refund.id,
        refundAmount: refund.total,
      });

      return { order, refund };
    } catch (error) {
      this.logger.error(
        `Failed to cancel and refund WooCommerce order: ${orderNumber}`,
        {
          error: error.message,
          userId,
        },
      );
      throw error;
    }
  }

  /**
   * Update order status in WooCommerce
   * @param userId - User ID
   * @param orderNumber - WooCommerce order number
   * @param status - New order status
   * @returns Updated order details
   */
  @ActivityMethod({ name: 'updateWooCommerceOrderStatus' })
  async updateWooCommerceOrderStatus(
    userId: string,
    orderNumber: string,
    status: string,
  ): Promise<any> {
    try {
      this.logger.log(`Updating WooCommerce order status: ${orderNumber} to ${status}`, {
        userId,
      });

      const client = this.getWooCommerceClient(userId);

      const response = await client.put<any>(`/orders/${orderNumber}`, {
        status,
      });

      this.logger.log(`WooCommerce order status updated: ${orderNumber}`, {
        orderId: response.data.id,
        status: response.data.status,
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update WooCommerce order status: ${orderNumber}`, {
        error: error.message,
        userId,
        status,
      });
      throw error;
    }
  }
}
