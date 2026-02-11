import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ShipStationService } from '../../../../shipstation/shipstation.service';

/**
 * Order Cancellation ShipStation Activities
 * Handles ShipStation API operations for order cancellation
 */
@Injectable()
@Activity()
export class OrderCancellationShipStationActivities {
  private readonly logger = new Logger(OrderCancellationShipStationActivities.name);

  constructor(private readonly shipStationService: ShipStationService) {}

  /**
   * Get ShipStation order by order number (WooCommerce order number)
   * @param orderNumber - WooCommerce order number
   * @returns ShipStation order or null if not found
   */
  @ActivityMethod({ name: 'getShipStationOrderByNumber' })
  async getShipStationOrderByNumber(orderNumber: string): Promise<any | null> {
    try {
      this.logger.log(`Fetching ShipStation order by number: ${orderNumber}`);

      const order = await this.shipStationService.getOrderByOrderNumber(orderNumber);

      if (!order) {
        this.logger.warn(`No ShipStation order found for order number: ${orderNumber}`);
        return null;
      }

      this.logger.log(`ShipStation order found: ${order.orderId}`, {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
      });

      return order;
    } catch (error) {
      this.logger.error(`Error fetching ShipStation order: ${error.message}`, {
        orderNumber,
        error,
      });
      throw error;
    }
  }

  /**
   * Check if ShipStation order is eligible for cancellation
   * @param orderNumber - WooCommerce order number
   * @returns Eligibility result
   */
  @ActivityMethod({ name: 'checkShipStationCancellationEligibility' })
  async checkShipStationCancellationEligibility(
    orderNumber: string,
  ): Promise<{ eligible: boolean; reason: string; order: any }> {
    try {
      this.logger.log(`Checking ShipStation cancellation eligibility for order: ${orderNumber}`);

      const result = await this.shipStationService.checkCancellationEligibility(orderNumber);

      this.logger.log(`ShipStation eligibility check result: ${result.eligible}`, {
        orderNumber,
        reason: result.reason,
      });

      return result;
    } catch (error) {
      this.logger.error(`Error checking ShipStation eligibility: ${error.message}`, {
        orderNumber,
        error,
      });
      throw error;
    }
  }

  /**
   * Cancel ShipStation order
   * This will void any active shipment labels and then delete the order
   * @param orderNumber - WooCommerce order number
   * @returns Cancellation result
   */
  @ActivityMethod({ name: 'cancelShipStationOrder' })
  async cancelShipStationOrder(orderNumber: string): Promise<{
    success: boolean;
    message: string;
    voidedLabels: number;
    details: any;
  }> {
    try {
      this.logger.log(`Cancelling ShipStation order: ${orderNumber}`);

      const result = await this.shipStationService.cancelOrder(orderNumber);

      this.logger.log(`ShipStation order cancelled: ${orderNumber}`, {
        success: result.success,
        voidedLabels: result.voidedLabels,
      });

      return result;
    } catch (error) {
      this.logger.error(`Error cancelling ShipStation order: ${error.message}`, {
        orderNumber,
        error,
      });
      throw error;
    }
  }
}
