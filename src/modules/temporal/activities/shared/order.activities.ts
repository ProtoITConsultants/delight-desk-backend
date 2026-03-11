import { Injectable } from '@nestjs/common';
import { Activity, ActivityMethod } from 'nestjs-temporal-core';
import type { EmailEntity } from 'src/database/schema';
import { WooCommerceRestApiService } from 'src/modules/woocommerce/woocommerce-rest-api.service';
import { AgentsService } from 'src/modules/agents/agents.service';
import type { OrderDetails, OrderExtractionResult } from '../../workflows/types';

@Injectable()
@Activity()
export class OrderActivities {
  constructor(
    private readonly agentsService: AgentsService,
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
}
