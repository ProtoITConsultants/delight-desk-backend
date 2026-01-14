import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AfterShip } from '@aftership/tracking-sdk';
import { Tracking } from '@aftership/tracking-sdk/dist/model/Tracking';

@Injectable()
export class AftershipService {
  private readonly aftership: AfterShip;

  constructor(private readonly configService: ConfigService) {
    this.aftership = new AfterShip({
      api_key: this.configService.get<string>('AFTERSHIP_API_KEY'),
      timeout: 10000,
    });
  }

  async createTracking(
    trackingNumber: string,
    carrierSlug: string,
    orderId: number,
  ): Promise<Tracking> {
    try {
      const tracking = await this.aftership.tracking.createTracking({
        tracking_number: trackingNumber,
        slug: carrierSlug,
        order_id: String(orderId),
      });

      return tracking.data;
    } catch (error: any) {
      if (error?.code === 'TRACKING_ALREADY_EXIST' && error.response_body) {
        const body = JSON.parse(error.response_body);
        const trackingId = body?.data?.id;

        if (!trackingId) {
          throw new Error('TRACKING_ALREADY_EXIST but no tracking id returned');
        }

        return this.getTrackingById(trackingId);
      }

      throw error;
    }
  }

  async getTrackingById(trackingNumber: string): Promise<Tracking> {
    try {
      const result = await this.aftership.tracking.getTrackingById(trackingNumber);
      return result.data;
    } catch (error) {
      throw error;
    }
  }
}
