import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import {
  ShipStationLabel,
  ShipStationLabelsResponse,
  ShipStationShipment,
  ShipStationShipmentsResponse,
  ShipStationShipmentStatus,
  ShipStationVoidLabelResponse,
} from './shipstation.types';

/**
 * ShipStation Service
 * Integrates with ShipStation API v2 for shipment and label cancellation workflows.
 *
 * OpenAPI: ShipStation API v2 (3.1.0 / version 2.0.0)
 */
@Injectable()
export class ShipStationService {
  private readonly logger = new Logger(ShipStationService.name);
  private readonly baseUrl: string;
  private readonly isTestMode: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly systemSettingsRepository: SystemSettingsRepository,
  ) {
    this.baseUrl = this.configService.get<string>('SHIPSTATION_BASE_URL') as string;
    this.isTestMode = this.configService.get<string>('SHIPSTATION_TEST_MODE') === 'true';

    this.logger.log('ShipStation service initialized', {
      baseUrl: this.baseUrl,
      testMode: this.isTestMode,
    });
  }

  /**
   * Get shipment by shipment number (treated as external order number from WooCommerce).
   *
   * API: GET /v2/shipments?shipment_number={orderNumber}
   */
  async getOrderByOrderNumber(
    userId: string,
    orderNumber: string,
  ): Promise<ShipStationShipment | null> {
    try {
      this.logger.log(`Fetching ShipStation shipment by shipment_number: ${orderNumber}`);
      const axiosInstance = await this.getClientForUser(userId);

      const response = await axiosInstance.get<ShipStationShipmentsResponse>('/v2/shipments', {
        params: {
          shipment_number: orderNumber,
          page: 1,
          page_size: 1,
        },
      });

      const shipment = response.data.shipments?.[0];
      if (shipment) {
        this.logger.log(`ShipStation shipment found for ${orderNumber}`, {
          shipmentId: shipment.shipment_id,
          shipmentStatus: shipment.shipment_status,
        });
        return shipment;
      }

      this.logger.warn(`No ShipStation shipment found for shipment_number: ${orderNumber}`);
      return null;
    } catch (error: any) {
      if (error?.response?.status === 404) {
        return null;
      }

      // ShipStation sandbox can return account-level carrier errors on shipment list queries
      // (e.g. missing pickup_id / invalid inventory_warehouse_id). In test mode, treat this
      // as "not found" so cancellation flow can continue into a controlled not-found path.
      if (this.isTestMode && this.isSandboxCarrierAccountStatusError(error)) {
        this.logger.warn(
          `ShipStation sandbox account status error while resolving ${orderNumber}; treating as not found in test mode`,
          {
            userId,
            orderNumber,
            apiError: this.extractShipStationApiErrorMessage(error),
          },
        );
        return null;
      }

      this.logger.error(`Error fetching ShipStation shipment: ${error?.message}`, {
        userId,
        orderNumber,
        status: error?.response?.status,
        data: error?.response?.data,
      });
      this.throwShipStationApiError(error, 'Failed to fetch order from ShipStation');
    }
  }

  /**
   * Resolve a ShipStation shipment from the WooCommerce order ID.
   */
  async getOrderByWooCommerceOrderId(
    userId: string,
    wooCommerceOrderId: string,
  ): Promise<ShipStationShipment | null> {
    return this.getOrderByOrderNumber(userId, wooCommerceOrderId);
  }

  /**
   * Get shipment by ShipStation shipment ID.
   *
   * API: GET /v2/shipments/{shipment_id}
   */
  async getOrderById(userId: string, orderId: number | string): Promise<ShipStationShipment> {
    const shipmentId = String(orderId);

    try {
      this.logger.log(`Fetching ShipStation shipment by ID: ${shipmentId}`);
      const axiosInstance = await this.getClientForUser(userId);

      const response = await axiosInstance.get<ShipStationShipment>(`/v2/shipments/${shipmentId}`);
      return response.data;
    } catch (error: any) {
      this.logger.error(`Error fetching ShipStation shipment by ID: ${error?.message}`, {
        userId,
        shipmentId,
        status: error?.response?.status,
        data: error?.response?.data,
      });

      if (error?.response?.status === 404) {
        throw new NotFoundException(`ShipStation shipment not found: ${shipmentId}`);
      }

      this.throwShipStationApiError(error, 'Failed to fetch order from ShipStation');
    }
  }

  /**
   * Check whether a shipment is eligible for cancellation.
   * A cancelled shipment is not eligible. Active labels must be voided first.
   */
  async checkCancellationEligibility(
    userId: string,
    orderNumber: string,
  ): Promise<{ eligible: boolean; reason: string; order: ShipStationShipment }> {
    try {
      this.logger.log(`Checking ShipStation cancellation eligibility for: ${orderNumber}`);

      const shipment = await this.getOrderByOrderNumber(userId, orderNumber);
      if (!shipment) {
        throw new NotFoundException(`Order not found in ShipStation: ${orderNumber}`);
      }

      if (shipment.shipment_status === ShipStationShipmentStatus.CANCELLED) {
        return {
          eligible: false,
          reason: 'Shipment is already cancelled',
          order: shipment,
        };
      }

      const labels = await this.getShipmentLabels(userId, shipment.shipment_id);
      const activeLabels = labels.filter((label) => !label.voided);
      if (activeLabels.length > 0) {
        return {
          eligible: false,
          reason: 'Shipment has active labels that must be voided before cancellation',
          order: shipment,
        };
      }

      return {
        eligible: true,
        reason: 'Shipment is eligible for cancellation',
        order: shipment,
      };
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Error checking ShipStation cancellation eligibility: ${error?.message}`, {
        userId,
        orderNumber,
      });
      throw new BadRequestException('Failed to check cancellation eligibility');
    }
  }

  /**
   * Void a label by its ShipStation label ID.
   *
   * API: PUT /v2/labels/{label_id}/void
   */
  async voidShipmentLabel(
    userId: string,
    labelId: number | string,
  ): Promise<{ approved: boolean; message: string }> {
    const normalizedLabelId = String(labelId);

    try {
      this.logger.log(`Voiding ShipStation label: ${normalizedLabelId}`);
      const axiosInstance = await this.getClientForUser(userId);

      const response = await axiosInstance.put<ShipStationVoidLabelResponse>(
        `/v2/labels/${normalizedLabelId}/void`,
      );

      this.logger.log(`ShipStation label void response: ${normalizedLabelId}`, {
        approved: response.data.approved,
        reasonCode: response.data.reason_code,
      });

      return {
        approved: response.data.approved,
        message: response.data.message,
      };
    } catch (error: any) {
      this.logger.error(`Error voiding ShipStation label: ${error?.message}`, {
        userId,
        labelId: normalizedLabelId,
        status: error?.response?.status,
        data: error?.response?.data,
      });
      this.throwShipStationApiError(error, 'Failed to void shipment label');
    }
  }

  /**
   * Cancel a shipment by ShipStation shipment ID.
   *
   * API: PUT /v2/shipments/{shipment_id}/cancel (204 on success)
   */
  async deleteOrder(
    userId: string,
    orderId: number | string,
  ): Promise<{ success: boolean; message: string }> {
    const shipmentId = String(orderId);

    try {
      this.logger.log(`Cancelling ShipStation shipment: ${shipmentId}`);
      const axiosInstance = await this.getClientForUser(userId);
      await axiosInstance.put(`/v2/shipments/${shipmentId}/cancel`);

      return {
        success: true,
        message: `Shipment ${shipmentId} cancelled successfully`,
      };
    } catch (error: any) {
      this.logger.error(`Error cancelling ShipStation shipment: ${error?.message}`, {
        userId,
        shipmentId,
        status: error?.response?.status,
        data: error?.response?.data,
      });

      if (error?.response?.status === 404) {
        throw new NotFoundException(`ShipStation shipment not found: ${shipmentId}`);
      }

      this.throwShipStationApiError(error, 'Failed to cancel shipment in ShipStation');
    }
  }

  /**
   * Cancel a shipment by shipment number (external order number).
   * Any active labels are voided first, then the shipment is cancelled.
   */
  async cancelOrder(
    userId: string,
    orderNumber: string,
  ): Promise<{
    success: boolean;
    message: string;
    voidedLabels: number;
    details: any;
  }> {
    try {
      this.logger.log(`Attempting ShipStation cancellation for order number: ${orderNumber}`);

      const shipment = await this.getOrderByOrderNumber(userId, orderNumber);
      if (!shipment) {
        throw new NotFoundException(`Order not found in ShipStation: ${orderNumber}`);
      }

      if (shipment.shipment_status === ShipStationShipmentStatus.CANCELLED) {
        throw new BadRequestException('Shipment is already cancelled');
      }

      const labels = await this.getShipmentLabels(userId, shipment.shipment_id);
      const activeLabels = labels.filter((label) => !label.voided);

      let voidedLabels = 0;
      for (const label of activeLabels) {
        const result = await this.voidShipmentLabel(userId, label.label_id);
        if (!result.approved) {
          throw new BadRequestException(
            `Cannot cancel shipment because label ${label.label_id} could not be voided: ${result.message}`,
          );
        }
        voidedLabels++;
      }

      const cancelResult = await this.deleteOrder(userId, shipment.shipment_id);

      this.logger.log(`ShipStation shipment cancelled for order number: ${orderNumber}`, {
        shipmentId: shipment.shipment_id,
        voidedLabels,
      });

      return {
        success: cancelResult.success,
        message: `Order ${orderNumber} cancelled successfully`,
        voidedLabels,
        details: {
          shipmentId: shipment.shipment_id,
          cancellation: cancelResult,
        },
      };
    } catch (error: any) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }

      this.logger.error(`Unexpected error cancelling ShipStation shipment: ${error?.message}`, {
        userId,
        orderNumber,
      });
      throw new BadRequestException('Failed to cancel order in ShipStation');
    }
  }

  /**
   * Cancel a ShipStation order using the WooCommerce order ID.
   */
  async cancelOrderByWooCommerceOrderId(userId: string, wooCommerceOrderId: string) {
    return this.cancelOrder(userId, wooCommerceOrderId);
  }

  async updateOrderShippingAddressByWooCommerceOrderId(
    userId: string,
    wooCommerceOrderId: string,
    shippingAddress: {
      name?: string;
      company?: string;
      street1: string;
      street2?: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
      phone?: string;
      residential?: boolean;
    },
  ): Promise<any> {
    const shipment = await this.getOrderByWooCommerceOrderId(userId, wooCommerceOrderId);
    if (!shipment) {
      throw new NotFoundException(`Order not found in ShipStation: ${wooCommerceOrderId}`);
    }

    const shipmentStatus = String(shipment.shipment_status || '').toLowerCase();
    if (shipmentStatus === ShipStationShipmentStatus.CANCELLED) {
      throw new BadRequestException('ShipStation shipment is cancelled and not editable');
    }
    if (shipmentStatus === ShipStationShipmentStatus.LABEL_PURCHASED) {
      throw new BadRequestException(
        'ShipStation shipment already has label purchased and is not editable',
      );
    }

    const currentShipment = (await this.getOrderById(userId, shipment.shipment_id)) as any;
    const currentShipTo = currentShipment?.ship_to || {};
    const updatedShipTo = {
      ...currentShipTo,
      name: shippingAddress.name ?? currentShipTo.name,
      company_name: shippingAddress.company ?? currentShipTo.company_name,
      address_line1: shippingAddress.street1,
      address_line2: shippingAddress.street2 ?? currentShipTo.address_line2,
      city_locality: shippingAddress.city,
      state_province: shippingAddress.state ?? currentShipTo.state_province,
      postal_code: shippingAddress.postalCode,
      country_code: shippingAddress.country,
      phone: shippingAddress.phone ?? currentShipTo.phone,
      address_residential_indicator:
        typeof shippingAddress.residential === 'boolean'
          ? shippingAddress.residential
            ? 'yes'
            : 'no'
          : currentShipTo.address_residential_indicator || 'unknown',
    };

    const axiosInstance = await this.getClientForUser(userId);
    const updateResponse = await axiosInstance.put(`/v2/shipments/${shipment.shipment_id}`, {
      ship_to: updatedShipTo,
    });
    return updateResponse.data;
  }

  async verifyCredentials(apiKey: string): Promise<void> {
    try {
      const axiosInstance = this.createClient(apiKey);
      // Use a lightweight endpoint for key validation.
      // The docs mock for /v2/shipments can return non-auth 400s.
      await axiosInstance.get('/v2/tags');
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        throw new BadRequestException('Invalid ShipStation API key');
      }

      if (error instanceof BadRequestException) {
        throw error;
      }

      const apiMessage =
        error?.response?.data?.errors?.[0]?.message ||
        error?.response?.data?.message ||
        error?.message;
      throw new BadRequestException(apiMessage || 'Unable to verify ShipStation credentials');
    }
  }

  private async getShipmentLabels(userId: string, shipmentId: string): Promise<ShipStationLabel[]> {
    try {
      const axiosInstance = await this.getClientForUser(userId);
      const response = await axiosInstance.get<ShipStationLabelsResponse>('/v2/labels', {
        params: {
          shipment_id: shipmentId,
          page: 1,
          page_size: 500,
        },
      });

      return response.data.labels ?? [];
    } catch (error: any) {
      this.logger.error(`Error listing ShipStation labels for shipment: ${error?.message}`, {
        userId,
        shipmentId,
        status: error?.response?.status,
        data: error?.response?.data,
      });
      this.throwShipStationApiError(error, 'Failed to fetch shipment labels');
    }
  }

  private throwShipStationApiError(error: any, fallbackMessage: string): never {
    const status = error?.response?.status;
    const apiMessage = this.extractShipStationApiErrorMessage(error);

    if (status === 401 || status === 403) {
      throw new BadRequestException('ShipStation API authentication failed');
    }

    if (status === 404) {
      throw new NotFoundException(apiMessage || 'ShipStation resource not found');
    }

    throw new BadRequestException(apiMessage || fallbackMessage);
  }

  private extractShipStationApiErrorMessage(error: any): string {
    const data = error?.response?.data;
    const firstApiError = Array.isArray(data?.errors) ? data.errors[0] : null;
    return (
      firstApiError?.message || data?.message || error?.message || 'ShipStation API request failed'
    );
  }

  private isSandboxCarrierAccountStatusError(error: any): boolean {
    const data = error?.response?.data;
    const errors = Array.isArray(data?.errors) ? data.errors : [];

    return errors.some((entry: any) => {
      const code = String(entry?.error_code || '').toLowerCase();
      const type = String(entry?.error_type || '').toLowerCase();
      const fieldName = String(entry?.field_name || '').toLowerCase();
      const message = String(entry?.message || '').toLowerCase();
      const fieldValue = String(entry?.field_value || '').toLowerCase();

      return (
        (type === 'account_status' && code === 'auto_fund_not_supported') ||
        (message.includes('pickup_id') && fieldName === 'inventory_warehouse_id') ||
        (fieldName === 'inventory_warehouse_id' && fieldValue === 'invalid-id')
      );
    });
  }

  private createClient(apiKey: string) {
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  private async getClientForUser(userId: string) {
    const settings = await this.systemSettingsRepository.findByUser(userId);
    const apiKey = settings?.shipstationApiKey;

    if (!apiKey) {
      throw new BadRequestException(
        'ShipStation API key is not configured for this user. Please set ShipStation fulfillment first.',
      );
    }

    return this.createClient(apiKey);
  }
}
