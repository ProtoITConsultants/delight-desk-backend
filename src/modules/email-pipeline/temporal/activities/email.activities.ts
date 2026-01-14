import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import type { EmailEntity } from 'src/database/schema/email.schema';
import { WooCommerceRestApiService } from '../../../woocommerce/woocommerce-rest-api.service';
import { AftershipService } from '../../../aftership/aftership.service';
import { Tracking } from '@aftership/tracking-sdk/dist/model/Tracking';
import { GoogleOauthService } from '../../../google-oauth/google-oauth.service';
import { AgentsService } from '../../../agents/agents.service';
import { OrderDetails, OrderExtractionResult } from '../../types';
import { AiAssistantService } from 'src/modules/agents/ai-assistant/ai-assistant.service';

@Injectable()
@Activity()
export class EmailActivities {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly aftershipService: AftershipService,
    private readonly googleOAuthService: GoogleOauthService,
    private readonly aiAssistantService: AiAssistantService,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
  ) {}

  @ActivityMethod({ name: 'extractOrderNumberFromEmail' })
  extractOrderNumberFromEmail(email: EmailEntity): Promise<OrderExtractionResult> {
    return this.agentsService.extractOrderNumber(email);
  }

  @ActivityMethod({ name: 'getMostRecentOrderByEmail' })
  getMostRecentOrderByEmail(userId: string, email: string): Promise<any> {
    return this.wooCommerceRestApiService.getMostRecentOrderByEmail(userId, email);
  }

  @ActivityMethod({ name: 'getWooCommerceOrderById' })
  getWooCommerceOrderById(userId: string, orderId: string): Promise<OrderDetails> {
    return this.wooCommerceRestApiService.getOrderById(userId, orderId);
  }

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

  @ActivityMethod({ name: 'sendCustomerNotificationViaGmailThread' })
  sendCustomerNotificationViaGmailThread(
    userId: string,
    to: string,
    subject: string,
    message: string,
    threadId: string,
  ): Promise<any> {
    return this.googleOAuthService.replyToGmailThread(userId, to, subject, message, threadId);
  }

  @ActivityMethod({ name: 'createEscalation' })
  createEscalation(data: any): void {
    this.aiAssistantService.createEscalation(data);
  }
}
