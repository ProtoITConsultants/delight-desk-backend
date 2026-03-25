import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import {
  ShipBobCancellationStatus,
  ShipBobCancelOrderResponse,
  ShipBobChannelsResponse,
  ShipBobOrder,
  ShipBobOrderListResponse,
  ShipBobOrderStatus,
} from './shipbob.types';

/**
 * ShipBob Service
 * Integrates with ShipBob API 2025-07 for order management
 *
 * API Documentation: https://developer.shipbob.com/
 */
@Injectable()
export class ShipBobService {
  private readonly logger = new Logger(ShipBobService.name);
  private readonly baseUrl: string;
  private readonly isTestMode: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly systemSettingsRepository: SystemSettingsRepository,
  ) {
    this.baseUrl = this.configService.get<string>('SHIPBOB_BASE_URL') as string;
    this.isTestMode = this.configService.get<string>('SHIPBOB_TEST_MODE') === 'true';

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
  async getOrderById(userId: string, orderId: number): Promise<ShipBobOrder> {
    try {
      this.logger.log(`Fetching ShipBob order: ${orderId}`);
      const axiosInstance = await this.getClientForUser(userId);

      const response = await axiosInstance.get<ShipBobOrder>(`/2026-01/order/${orderId}`);

      this.logger.log(`ShipBob order retrieved: ${orderId}`, {
        status: response.data.status,
        orderNumber: response.data.order_number,
      });

      return response.data;
    } catch (error: any) {
      if (error.response) {
        this.logger.error(`ShipBob API error: ${error.message}`, {
          userId,
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

      this.logger.error(`Unexpected error fetching ShipBob order: ${error?.message}`, {
        userId,
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
    userId: string,
    orderId: number,
  ): Promise<{ eligible: boolean; reason: string; order: ShipBobOrder }> {
    try {
      this.logger.log(`Checking cancellation eligibility for order: ${orderId}`);

      const order = await this.getOrderById(userId, orderId);

      // Check if order status allows cancellation
      if (
        order.status === ShipBobOrderStatus.COMPLETED ||
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
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Error checking cancellation eligibility: ${error?.message}`, {
        userId,
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
  async cancelOrder(
    userId: string,
    orderId: number,
  ): Promise<{
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
      const eligibility = await this.checkCancellationEligibility(userId, orderId);

      if (!eligibility.eligible) {
        this.logger.warn(`Order ${orderId} not eligible for cancellation`, {
          reason: eligibility.reason,
        });
        throw new BadRequestException(`Cannot cancel order: ${eligibility.reason}`);
      }

      // Proceed with cancellation
      const axiosInstance = await this.getClientForUser(userId);
      const response = await axiosInstance.post<ShipBobCancelOrderResponse>(
        `/2026-01/order/${orderId}:cancel`,
      );

      const result = response.data;
      const status = result.status || ShipBobCancellationStatus.FAILURE;
      const canceledShipments =
        result.canceled_shipment_results?.filter((r: any) => r.is_success).length || 0;
      const failedShipments =
        result.canceled_shipment_results?.filter((r: any) => !r.is_success).length || 0;

      const success = status === ShipBobCancellationStatus.SUCCESS;

      this.logger.log(`ShipBob order cancellation result for ${orderId}`, {
        status,
        canceledShipments,
        failedShipments,
      });

      return {
        success,
        status,
        message: success
          ? `Order ${orderId} cancelled successfully`
          : `Order ${orderId} cancellation failed or partial`,
        canceledShipments,
        failedShipments,
        details: result,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      if (error.response) {
        this.logger.error(`ShipBob cancellation API error: ${error.message}`, {
          userId,
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

      this.logger.error(`Unexpected error canceling ShipBob order: ${error?.message}`, {
        userId,
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
  async getOrderByReferenceId(userId: string, referenceId: string): Promise<ShipBobOrder | null> {
    try {
      this.logger.log(`Searching ShipBob order by reference ID: ${referenceId}`);
      const axiosInstance = await this.getClientForUser(userId);

      const response = await axiosInstance.get<ShipBobOrderListResponse | ShipBobOrder[]>(
        '/2026-01/order',
        {
          params: {
            ReferenceIds: referenceId,
            Limit: 1,
            Page: 1,
          },
        },
      );

      const data = response.data;
      const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];

      if (items.length > 0) {
        const order = items[0];
        this.logger.log(`ShipBob order found for reference ID: ${referenceId}`, {
          orderId: order.id,
        });
        return order;
      }

      this.logger.warn(`No ShipBob order found for reference ID: ${referenceId}`);
      return null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }

      this.logger.error(`Error fetching ShipBob order by reference ID: ${error?.message}`, {
        userId,
        referenceId,
        error,
      });
      throw new BadRequestException('Failed to fetch order from ShipBob');
    }
  }

  /**
   * Resolve a ShipBob order from the WooCommerce order ID.
   * ShipBob maps the upstream platform order ID through `reference_id`.
   */
  async getOrderByWooCommerceOrderId(
    userId: string,
    wooCommerceOrderId: string,
  ): Promise<ShipBobOrder | null> {
    return this.getOrderByReferenceId(userId, wooCommerceOrderId);
  }

  /**
   * Cancel a ShipBob order using the WooCommerce order ID as the external lookup key.
   */
  async cancelOrderByWooCommerceOrderId(userId: string, wooCommerceOrderId: string) {
    const order = await this.getOrderByWooCommerceOrderId(userId, wooCommerceOrderId);

    if (!order) {
      throw new NotFoundException(
        `ShipBob order not found for WooCommerce order ID: ${wooCommerceOrderId}`,
      );
    }

    return this.cancelOrder(userId, order.id);
  }

  async updateOrderRecipientAddress(
    userId: string,
    orderId: number,
    recipient: {
      name: string;
      address: {
        address1: string;
        address2?: string;
        city: string;
        state?: string;
        country: string;
        zip_code: string;
        company_name?: string;
      };
      email?: string;
      phone_number?: string;
    },
  ): Promise<any> {
    try {
      const axiosInstance = await this.getClientForUser(userId);
      const response = await axiosInstance.put(`/2026-01/order/${orderId}`, {
        recipient,
      });
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404 || error?.response?.status === 405) {
        throw new BadRequestException(
          'ShipBob address update endpoint is unavailable for current API/version; manual update is required.',
        );
      }
      throw new BadRequestException(
        `Failed to update ShipBob order address: ${error?.response?.data?.message || error?.message}`,
      );
    }
  }

  async updateOrderRecipientAddressByWooCommerceOrderId(
    userId: string,
    wooCommerceOrderId: string,
    recipient: {
      name: string;
      address: {
        address1: string;
        address2?: string;
        city: string;
        state?: string;
        country: string;
        zip_code: string;
        company_name?: string;
      };
      email?: string;
      phone_number?: string;
    },
  ): Promise<any> {
    const order = await this.getOrderByWooCommerceOrderId(userId, wooCommerceOrderId);
    if (!order) {
      throw new NotFoundException(
        `ShipBob order not found for WooCommerce order ID: ${wooCommerceOrderId}`,
      );
    }
    return this.updateOrderRecipientAddress(userId, order.id, recipient);
  }

  async verifyCredentials(personalAccessToken: string): Promise<{ channelId: string }> {
    try {
      const axiosInstance = this.createClient(personalAccessToken);
      const response = await axiosInstance.get<ShipBobChannelsResponse>('/2026-01/channel');
      const channels = Array.isArray(response.data?.items) ? response.data.items : [];

      const writableChannel = channels.find(
        (channel) =>
          Array.isArray(channel.scopes) &&
          channel.scopes.some((scope) => typeof scope === 'string' && scope.endsWith('_write')),
      );

      if (!writableChannel?.id) {
        throw new BadRequestException('No writable ShipBob channel found for this token');
      }

      return { channelId: String(writableChannel.id) };
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        throw new BadRequestException('Invalid ShipBob personal access token');
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Unable to verify ShipBob credentials');
    }
  }

  private getHeaders(personalAccessToken: string, channelId?: string) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${personalAccessToken}`,
    };

    if (channelId) {
      headers.shipbob_channel_id = channelId;
    }

    return headers;
  }

  private createClient(personalAccessToken: string, channelId?: string) {
    return axios.create({
      baseURL: this.baseUrl,
      headers: this.getHeaders(personalAccessToken, channelId),
      timeout: 10000,
    });
  }

  private async getClientForUser(userId: string) {
    const settings = await this.systemSettingsRepository.findByUser(userId);
    const pat = settings?.shipbobPersonalAccessToken;

    if (!pat) {
      throw new BadRequestException(
        'ShipBob personal access token is not configured for this user. Please set ShipBob fulfillment first.',
      );
    }

    return this.createClient(pat, settings?.shipbobChannelId ?? undefined);
  }
}
