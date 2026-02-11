import { Injectable, Logger } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { ShipBobService } from '../../../../shipbob/shipbob.service';

/**
 * Order Cancellation ShipBob Activities
 * Handles ShipBob API operations for order cancellation
 */
@Injectable()
@Activity()
export class OrderCancellationShipBobActivities {
  private readonly logger = new Logger(OrderCancellationShipBobActivities.name);

  constructor(private readonly shipBobService: ShipBobService) {}

  /**
   * Get ShipBob order by WooCommerce order number (reference ID)
   * @param referenceId - WooCommerce order number
   * @returns ShipBob order or null if not found
   */
  @ActivityMethod({ name: 'getShipBobOrderByReference' })
  async getShipBobOrderByReference(referenceId: string): Promise<any | null> {
    try {
      this.logger.log(`Fetching ShipBob order by reference: ${referenceId}`);

      const order = await this.shipBobService.getOrderByReferenceId(referenceId);

      if (!order) {
        this.logger.warn(`No ShipBob order found for reference: ${referenceId}`);
        return null;
      }

      this.logger.log(`ShipBob order found: ${order.id}`, {
        orderId: order.id,
        status: order.status,
      });

      return order;
    } catch (error) {
      this.logger.error(`Error fetching ShipBob order: ${error.message}`, {
        referenceId,
        error,
      });
      throw error;
    }
  }

  /**
   * Check if ShipBob order is eligible for cancellation
   * @param orderId - ShipBob order ID
   * @returns Eligibility result
   */
  @ActivityMethod({ name: 'checkShipBobCancellationEligibility' })
  async checkShipBobCancellationEligibility(
    orderId: number,
  ): Promise<{ eligible: boolean; reason: string; order: any }> {
    try {
      this.logger.log(`Checking ShipBob cancellation eligibility for order: ${orderId}`);

      const result = await this.shipBobService.checkCancellationEligibility(orderId);

      this.logger.log(`ShipBob eligibility check result: ${result.eligible}`, {
        orderId,
        reason: result.reason,
      });

      return result;
    } catch (error) {
      this.logger.error(`Error checking ShipBob eligibility: ${error.message}`, {
        orderId,
        error,
      });
      throw error;
    }
  }

  /**
   * Cancel ShipBob order
   * @param orderId - ShipBob order ID
   * @returns Cancellation result
   */
  @ActivityMethod({ name: 'cancelShipBobOrder' })
  async cancelShipBobOrder(orderId: number): Promise<{
    success: boolean;
    status: string;
    message: string;
    canceledShipments: number;
    failedShipments: number;
    details: any;
  }> {
    try {
      this.logger.log(`Cancelling ShipBob order: ${orderId}`);

      const result = await this.shipBobService.cancelOrder(orderId);

      this.logger.log(`ShipBob order cancelled: ${orderId}`, {
        success: result.success,
        canceledShipments: result.canceledShipments,
      });

      return result;
    } catch (error) {
      this.logger.error(`Error cancelling ShipBob order: ${error.message}`, {
        orderId,
        error,
      });
      throw error;
    }
  }
}
