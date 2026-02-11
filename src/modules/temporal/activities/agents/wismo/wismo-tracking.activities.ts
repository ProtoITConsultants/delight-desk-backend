import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import { AftershipService } from '../../../../aftership/aftership.service';
import { Tracking } from '@aftership/tracking-sdk/dist/model/Tracking';

@Injectable()
@Activity()
export class WismoTrackingActivities {
  constructor(private readonly aftershipService: AftershipService) {}

  @ActivityMethod({ name: 'createAfterShipTracking' })
  createAfterShipTracking(
    trackingNumber: string,
    carrierSlug: string,
    orderId: number,
  ): Promise<Tracking> {
    return this.aftershipService.createTracking(trackingNumber, carrierSlug, orderId);
  }

  @ActivityMethod({ name: 'fetchAfterShipStatus' })
  fetchAfterShipStatus(trackingNumber: string): Promise<Tracking> {
    return this.aftershipService.getTrackingById(trackingNumber);
  }
}
