import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * ShipBob Order Status enum
 * Based on ShipBob API documentation
 */
export enum ShipBobOrderStatus {
  PROCESSING = 'Processing',
  EXCEPTION = 'Exception',
  PARTIALLY_FULFILLED = 'PartiallyFulfilled',
  FULFILLED = 'Fulfilled',
  CANCELLED = 'Cancelled',
  IMPORT_REVIEW = 'ImportReview',
}

/**
 * ShipBob Cancellation Result Status
 */
export enum ShipBobCancellationStatus {
  SUCCESS = 'Success',
  FAILURE = 'Failure',
  PARTIAL_SUCCESS = 'PartialSuccess',
}

/**
 * ShipBob Service
 * Integrates with ShipBob API 2025-07 for order management
 *
 * API Documentation: https://developer.shipbob.com/
 */
@Injectable()
export class ShipBobService {
  private readonly logger = new Logger(ShipBobService.name);
  private readonly pat: string;
  private readonly baseUrl: string;
  private readonly axiosInstance: any;
  private readonly isTestMode: boolean;

  constructor(private readonly configService: ConfigService) {
    this.pat = this.configService.get<string>('SHIPBOB_PAT') || '';
    this.baseUrl = this.configService.get<string>('SHIPBOB_BASE_URL') || 'https://api.shipbob.com';
    this.isTestMode = this.configService.get<string>('SHIPBOB_TEST_MODE') === 'true';

    if (!this.pat) {
      throw new Error('SHIPBOB_API_KEY is not configured');
    }

    if (!this.baseUrl) {
      throw new Error('SHIPBOB_BASE_URL is not configured');
    }

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.pat}`,
        //   TODO: Channel id must be passed in each api request headers explicitly
      },
    });

    this.logger.log('ShipBob service initialized', {
      baseUrl: this.baseUrl,
      testMode: this.isTestMode,
    });
  }

  /**
   * Get order details by order ID
   * @param orderId - ShipBob order ID
   * @returns Order details including status and shipments
   * @throws NotFoundException if order not found
   * @throws BadRequestException for API errors
   *
   * API: GET /2025-07/order/{orderId}
   * Docs: https://developer.shipbob.com/api-reference/2025-07/orders/get-order
   */
  async getOrderById(orderId: number): Promise<any> {
    try {
      this.logger.log(`Fetching ShipBob order: ${orderId}`);

      const response = await this.axiosInstance.get(`/2025-07/order/${orderId}`);

      this.logger.log(`ShipBob order retrieved: ${orderId}`, {
        status: response.data.status,
        orderNumber: response.data.order_number,
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        this.logger.error(`ShipBob API error: ${error.message}`, {
          status: error.response?.status,
          data: error.response?.data,
          orderId,
        });

        if (error.response?.status === 404) {
          throw new NotFoundException(`ShipBob order not found: ${orderId}`);
        }

        if (error.response?.status === 401) {
          throw new BadRequestException('ShipBob API authentication failed');
        }

        throw new BadRequestException(
          `Failed to fetch ShipBob order: ${error.response?.data?.message || error.message}`,
        );
      }

      this.logger.error(`Unexpected error fetching ShipBob order: ${error.message}`, {
        orderId,
        error,
      });
      throw new BadRequestException('Failed to fetch order from ShipBob');
    }
  }

  /**
   * Check if order is eligible for cancellation
   * An order is eligible if it's in Processing status and not yet fulfilled
   * @param orderId - ShipBob order ID
   * @returns Eligibility result with reason
   * @throws NotFoundException if order not found
   * @throws BadRequestException for API errors
   */
  async checkCancellationEligibility(
    orderId: number,
  ): Promise<{ eligible: boolean; reason: string; order: any }> {
    try {
      this.logger.log(`Checking cancellation eligibility for order: ${orderId}`);

      const order = await this.getOrderById(orderId);

      // Check if order status allows cancellation
      if (
        order.status === ShipBobOrderStatus.FULFILLED ||
        order.status === ShipBobOrderStatus.CANCELLED
      ) {
        return {
          eligible: false,
          reason: `Order status is ${order.status} - cannot be cancelled`,
          order,
        };
      }

      // Check if any shipments are already fulfilled
      if (order.shipments && order.shipments.length > 0) {
        const fulfilledShipments = order.shipments.filter(
          (shipment: any) => shipment.status === 'Fulfilled' || shipment.status === 'Shipped',
        );

        if (fulfilledShipments.length > 0) {
          return {
            eligible: false,
            reason: 'One or more shipments have already been fulfilled or shipped',
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
        orderId,
        error,
      });
      throw new BadRequestException('Failed to check cancellation eligibility');
    }
  }

  /**
   * Cancel an order by order ID
   * @param orderId - ShipBob order ID
   * @returns Cancellation result with status and details
   * @throws NotFoundException if order not found
   * @throws BadRequestException for API errors or if cancellation fails
   *
   * API: POST /2025-07/order/{orderId}:cancel
   * Docs: https://developer.shipbob.com/api-reference/2025-07/orders/cancel-single-order-by-order-id
   */
  async cancelOrder(orderId: number): Promise<{
    success: boolean;
    status: string;
    message: string;
    canceledShipments: number;
    failedShipments: number;
    details: any;
  }> {
    try {
      this.logger.log(`Attempting to cancel ShipBob order: ${orderId}`);

      // First check eligibility
      const eligibility = await this.checkCancellationEligibility(orderId);

      if (!eligibility.eligible) {
        this.logger.warn(`Order ${orderId} not eligible for cancellation`, {
          reason: eligibility.reason,
        });
        throw new BadRequestException(`Cannot cancel order: ${eligibility.reason}`);
      }

      // Proceed with cancellation
      const response = await this.axiosInstance.post(`/2025-07/order/${orderId}:cancel`);

      const result = response.data;
      const canceledShipments =
        result.canceled_shipment_results?.filter((r: any) => r.is_success).length || 0;
      const failedShipments =
        result.canceled_shipment_results?.filter((r: any) => !r.is_success).length || 0;

      const success = result.status === ShipBobCancellationStatus.SUCCESS;

      this.logger.log(`ShipBob order cancellation result for ${orderId}`, {
        status: result.status,
        canceledShipments,
        failedShipments,
      });

      return {
        success,
        status: result.status,
        message: success
          ? `Order ${orderId} cancelled successfully`
          : `Order ${orderId} cancellation failed or partial`,
        canceledShipments,
        failedShipments,
        details: result,
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      if (error.response) {
        this.logger.error(`ShipBob cancellation API error: ${error.message}`, {
          status: error.response?.status,
          data: error.response?.data,
          orderId,
        });

        if (error.response?.status === 404) {
          throw new NotFoundException(`ShipBob order not found: ${orderId}`);
        }

        if (error.response?.status === 401) {
          throw new BadRequestException('ShipBob API authentication failed');
        }

        if (error.response?.status === 422) {
          throw new BadRequestException(
            `Cannot cancel order: ${error.response?.data?.message || 'Order cannot be cancelled at this time'}`,
          );
        }

        throw new BadRequestException(
          `Failed to cancel order: ${error.response?.data?.message || error.message}`,
        );
      }

      this.logger.error(`Unexpected error canceling ShipBob order: ${error.message}`, {
        orderId,
        error,
      });
      throw new BadRequestException('Failed to cancel order in ShipBob');
    }
  }

  /**
   * Get order by reference ID (external order number, e.g., WooCommerce order ID)
   * @param referenceId - External reference ID (WooCommerce order number)
   * @returns Order details or null if not found
   */
  async getOrderByReferenceId(referenceId: string): Promise<any | null> {
    try {
      this.logger.log(`Searching ShipBob order by reference ID: ${referenceId}`);

      // ShipBob API allows filtering orders by reference_id
      const response = await this.axiosInstance.get('/2025-07/order', {
        params: {
          ReferenceId: referenceId,
        },
      });

      if (response.data && response.data.length > 0) {
        const order = response.data[0];
        this.logger.log(`ShipBob order found for reference ID: ${referenceId}`, {
          orderId: order.id,
        });
        return order;
      }

      this.logger.warn(`No ShipBob order found for reference ID: ${referenceId}`);
      return null;
    } catch (error) {
      if (error.response?.status === 404) {
        return null;
      }

      this.logger.error(`Error fetching ShipBob order by reference ID: ${error.message}`, {
        referenceId,
        error,
      });
      throw new BadRequestException('Failed to fetch order from ShipBob');
    }
  }
}
