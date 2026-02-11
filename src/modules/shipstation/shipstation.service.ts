import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// @ts-ignore
import axios, { AxiosInstance } from 'axios';

/**
 * ShipStation Order Status enum
 * Based on ShipStation API documentation
 */
export enum ShipStationOrderStatus {
  AWAITING_PAYMENT = 'awaiting_payment',
  AWAITING_SHIPMENT = 'awaiting_shipment',
  PENDING_FULFILLMENT = 'pending_fulfillment',
  SHIPPED = 'shipped',
  ON_HOLD = 'on_hold',
  CANCELLED = 'cancelled',
}

/**
 * ShipStation Service
 * Integrates with ShipStation API V1 for order and shipment management
 *
 * API Documentation: https://www.shipstation.com/docs/api/
 * Authentication Docs: https://www.shipstation.com/docs/api/requirements/
 */
@Injectable()
export class ShipStationService {
  private readonly logger = new Logger(ShipStationService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly axiosInstance: AxiosInstance;
  private readonly isTestMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('SHIPSTATION_API_KEY') || '';
    this.apiSecret = this.configService.get<string>('SHIPSTATION_API_SECRET') || '';
    this.baseUrl =
      this.configService.get<string>('SHIPSTATION_BASE_URL') || 'https://ssapi.shipstation.com';
    this.isTestMode = this.configService.get<string>('SHIPSTATION_TEST_MODE') === 'true';

    if (!this.apiKey) {
      throw new Error('SHIPSTATION_API_KEY is not configured');
    }

    if (!this.apiSecret) {
      throw new Error('SHIPSTATION_API_SECRET is not configured');
    }

    // Create Basic Auth token
    const authToken = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');

    // Create axios instance with base configuration
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    this.logger.log('ShipStation service initialized', {
      baseUrl: this.baseUrl,
      testMode: this.isTestMode,
    });
  }

  /**
   * Get order by order number (external reference, e.g., WooCommerce order number)
   * @param orderNumber - External order number
   * @returns Order details or null if not found
   *
   * API: GET /orders?orderNumber={orderNumber}
   * Docs: https://www.shipstation.com/docs/api/orders/list-orders/
   */
  async getOrderByOrderNumber(orderNumber: string): Promise<any | null> {
    try {
      this.logger.log(`Fetching ShipStation order by number: ${orderNumber}`);

      const response = await this.axiosInstance.get('/orders', {
        params: {
          orderNumber,
        },
      });

      if (response.data && response.data.orders && response.data.orders.length > 0) {
        const order = response.data.orders[0];
        this.logger.log(`ShipStation order found: ${orderNumber}`, {
          orderId: order.orderId,
          orderStatus: order.orderStatus,
        });
        return order;
      }

      this.logger.warn(`No ShipStation order found for order number: ${orderNumber}`);
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }

      this.logger.error(`Error fetching ShipStation order: ${error.message}`, {
        orderNumber,
        error,
      });
      throw new BadRequestException('Failed to fetch order from ShipStation');
    }
  }

  /**
   * Get order by ShipStation order ID
   * @param orderId - ShipStation internal order ID
   * @returns Order details
   * @throws NotFoundException if order not found
   *
   * API: GET /orders/{orderId}
   * Docs: https://www.shipstation.com/docs/api/orders/get-order/
   */
  async getOrderById(orderId: number): Promise<any> {
    try {
      this.logger.log(`Fetching ShipStation order by ID: ${orderId}`);

      const response = await this.axiosInstance.get(`/orders/${orderId}`);

      this.logger.log(`ShipStation order retrieved: ${orderId}`, {
        orderNumber: response.data.orderNumber,
        orderStatus: response.data.orderStatus,
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        this.logger.error(`ShipStation API error: ${error.message}`, {
          status: error.response?.status,
          data: error.response?.data,
          orderId,
        });

        if (error.response?.status === 404) {
          throw new NotFoundException(`ShipStation order not found: ${orderId}`);
        }

        if (error.response?.status === 401) {
          throw new BadRequestException('ShipStation API authentication failed');
        }

        throw new BadRequestException(
          `Failed to fetch ShipStation order: ${error.response?.data?.message || error.message}`,
        );
      }

      this.logger.error(`Unexpected error fetching ShipStation order: ${error.message}`, {
        orderId,
        error,
      });
      throw new BadRequestException('Failed to fetch order from ShipStation');
    }
  }

  /**
   * Check if order is eligible for cancellation
   * An order is eligible if it hasn't been shipped yet
   * @param orderNumber - External order number (e.g., WooCommerce order number)
   * @returns Eligibility result with reason
   * @throws NotFoundException if order not found
   */
  async checkCancellationEligibility(
    orderNumber: string,
  ): Promise<{ eligible: boolean; reason: string; order: any }> {
    try {
      this.logger.log(`Checking cancellation eligibility for order: ${orderNumber}`);

      const order = await this.getOrderByOrderNumber(orderNumber);

      if (!order) {
        throw new NotFoundException(`Order not found in ShipStation: ${orderNumber}`);
      }

      // Check if order status allows cancellation
      if (order.orderStatus === ShipStationOrderStatus.SHIPPED) {
        return {
          eligible: false,
          reason: 'Order has already been shipped',
          order,
        };
      }

      if (order.orderStatus === ShipStationOrderStatus.CANCELLED) {
        return {
          eligible: false,
          reason: 'Order is already cancelled',
          order,
        };
      }

      // Check if order has shipments with labels
      if (order.shipments && order.shipments.length > 0) {
        const shippedShipments = order.shipments.filter((s: any) => s.voided === false);
        if (shippedShipments.length > 0) {
          return {
            eligible: false,
            reason: 'Order has active shipment labels that need to be voided first',
            order,
          };
        }
      }

      // Order is eligible for cancellation
      return {
        eligible: true,
        reason: 'Order is eligible for cancellation',
        order,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Error checking cancellation eligibility: ${error.message}`, {
        orderNumber,
        error,
      });
      throw new BadRequestException('Failed to check cancellation eligibility');
    }
  }

  /**
   * Void shipment labels for an order
   * Must be done before canceling/deleting an order with shipments
   * @param shipmentId - ShipStation shipment ID
   * @returns Void result
   * @throws BadRequestException if voiding fails
   *
   * API: POST /shipments/voidlabel
   * Docs: https://www.shipstation.com/docs/api/shipments/void-label/
   */
  async voidShipmentLabel(shipmentId: number): Promise<{ approved: boolean; message: string }> {
    try {
      this.logger.log(`Voiding shipment label: ${shipmentId}`);

      const response = await this.axiosInstance.post('/shipments/voidlabel', {
        shipmentId,
      });

      this.logger.log(`Shipment label voided: ${shipmentId}`, {
        approved: response.data.approved,
        message: response.data.message,
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        this.logger.error(`ShipStation void label API error: ${error.message}`, {
          status: error.response?.status,
          data: error.response?.data,
          shipmentId,
        });

        throw new BadRequestException(
          `Failed to void shipment label: ${error.response?.data?.message || error.message}`,
        );
      }

      this.logger.error(`Unexpected error voiding shipment label: ${error.message}`, {
        shipmentId,
        error,
      });
      throw new BadRequestException('Failed to void shipment label');
    }
  }

  /**
   * Delete (cancel) an order
   * This is a soft delete - order is set to inactive but remains in database
   * @param orderId - ShipStation internal order ID
   * @returns Deletion result
   * @throws NotFoundException if order not found
   * @throws BadRequestException for API errors
   *
   * API: DELETE /orders/{orderId}
   * Docs: https://www.shipstation.com/docs/api/orders/delete/
   */
  async deleteOrder(orderId: number): Promise<{ success: boolean; message: string }> {
    try {
      this.logger.log(`Deleting ShipStation order: ${orderId}`);

      const response = await this.axiosInstance.delete(`/orders/${orderId}`);

      this.logger.log(`ShipStation order deleted: ${orderId}`, {
        success: response.data.success,
        message: response.data.message,
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        this.logger.error(`ShipStation delete order API error: ${error.message}`, {
          status: error.response?.status,
          data: error.response?.data,
          orderId,
        });

        if (error.response?.status === 404) {
          throw new NotFoundException(`ShipStation order not found: ${orderId}`);
        }

        if (error.response?.status === 401) {
          throw new BadRequestException('ShipStation API authentication failed');
        }

        throw new BadRequestException(
          `Failed to delete order: ${error.response?.data?.message || error.message}`,
        );
      }

      this.logger.error(`Unexpected error deleting ShipStation order: ${error.message}`, {
        orderId,
        error,
      });
      throw new BadRequestException('Failed to delete order from ShipStation');
    }
  }

  /**
   * Cancel order by order number
   * Handles voiding labels if necessary, then deletes the order
   * @param orderNumber - External order number (e.g., WooCommerce order number)
   * @returns Cancellation result with details
   * @throws NotFoundException if order not found
   * @throws BadRequestException for API errors or if order can't be cancelled
   */
  async cancelOrder(orderNumber: string): Promise<{
    success: boolean;
    message: string;
    voidedLabels: number;
    details: any;
  }> {
    try {
      this.logger.log(`Attempting to cancel ShipStation order: ${orderNumber}`);

      // Check eligibility
      const eligibility = await this.checkCancellationEligibility(orderNumber);

      if (!eligibility.eligible) {
        this.logger.warn(`Order ${orderNumber} not eligible for cancellation`, {
          reason: eligibility.reason,
        });
        throw new BadRequestException(`Cannot cancel order: ${eligibility.reason}`);
      }

      const order = eligibility.order;
      let voidedLabels = 0;

      // Void any active shipment labels first
      if (order.shipments && order.shipments.length > 0) {
        for (const shipment of order.shipments) {
          if (!shipment.voided && shipment.shipmentId) {
            try {
              await this.voidShipmentLabel(shipment.shipmentId);
              voidedLabels++;
            } catch (error) {
              this.logger.warn(`Failed to void shipment label ${shipment.shipmentId}`, {
                error: error.message,
              });
              // Continue with cancellation even if void fails
            }
          }
        }
      }

      // Delete the order
      const deleteResult = await this.deleteOrder(order.orderId);

      this.logger.log(`ShipStation order cancelled: ${orderNumber}`, {
        orderId: order.orderId,
        voidedLabels,
      });

      return {
        success: deleteResult.success,
        message: `Order ${orderNumber} cancelled successfully`,
        voidedLabels,
        details: deleteResult,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Unexpected error cancelling ShipStation order: ${error.message}`, {
        orderNumber,
        error,
      });
      throw new BadRequestException('Failed to cancel order in ShipStation');
    }
  }
}
