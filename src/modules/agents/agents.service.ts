import { AgentType, AgentTypes } from 'src/common/agent-types';
import { WooCommerceService } from '../woocommerce/woocommerce.service';
import { WooCommerceRestApiService } from '../woocommerce/woocommerce-rest-api.service';
import { AgentsRepository } from 'src/database/repos/agents.repository';
import {
  CreatePromoCodeConfigurationDto,
  ListPromoCodeConfigurationsDto,
  PaginatedPromoCodeConfigurationsResponse,
  ProductPreviewDto,
  ProductPreviewResponse,
  PromoCodeConfigurationResponse,
  UpdateSystemSettingsDto,
  UpdatePromoCodeConfigurationDto,
  UpdateUserAgentDto,
  WismoPreviewDto,
  WismoPreviewResponse,
} from './agents.dto';
import { ProductAgentPreviewService } from './product-agent-preview.service';
import { WooCommerceCouponSyncService } from './woocommerce-coupon-sync.service';
import { WooCommerceCouponWebhookService } from './woocommerce-coupon-webhook.service';
import { UserAgentsRepository } from 'src/database/repos/user-agents.repository';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { UserStoreConnectionsRepository } from 'src/database/repos/user-store-connections.repository';
import { UserRepository } from 'src/database/repos/users.repository';
import { PromoCodeConfigurationsRepository } from 'src/database/repos/promo-code-configurations.repository';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmailEntity } from '../../database/schema';
import { OpenAIService } from '../openai/openai.service';
import { OrderDetails, OrderExtractionResult } from '../temporal/workflows/types';
import { AftershipService } from '../aftership/aftership.service';
import {
  promoCodeDiscountTypes,
  PromoCodeUsageType,
  promoCodeUsageTypes,
  PromoCodeConfigurationEntity,
} from 'src/database/schema';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly agentsRepo: AgentsRepository,
    private readonly userAgentsRepo: UserAgentsRepository,
    private readonly wooCommerceService: WooCommerceService,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
    private readonly aftershipService: AftershipService,
    private readonly storeRepo: UserStoreConnectionsRepository,
    private readonly systemSettingsRepo: SystemSettingsRepository,
    private readonly userRepo: UserRepository,
    private readonly productAgentPreviewService: ProductAgentPreviewService,
    private readonly promoCodeConfigsRepo: PromoCodeConfigurationsRepository,
    private readonly wooCommerceCouponSyncService: WooCommerceCouponSyncService,
    private readonly wooCommerceCouponWebhookService: WooCommerceCouponWebhookService,
  ) {}

  async getAgentsForUser(userId: string) {
    return await this.agentsRepo.getAgentsForUser(userId);
  }

  async updateUserAgentSettings(userId: string, agentId: string, dto: UpdateUserAgentDto) {
    const { isEnabled, requiresModeration } = dto;
    if (isEnabled === undefined && requiresModeration === undefined) {
      throw new BadRequestException(
        'At least one field must be provided to update agent settings.',
      );
    }

    const agent = await this.agentsRepo.getAgentById(agentId);
    if (!agent) throw new NotFoundException('Agent not found');

    if (isEnabled === true && agent.type !== AgentTypes.PRODUCT) {
      const hasStore = await this.storeRepo.userHasStore(userId);
      if (!hasStore) {
        throw new ConflictException(
          'Please connect your WooCommerce store before enabling the agent',
        );
      }
    }

    // Snapshot the agent's current state BEFORE applying the update so we can detect
    // an off->on transition for the Promo Code agent and kick off the WooCommerce ->
    // Delight Desk backfill exactly once.
    const previousUserAgent = await this.userAgentsRepo.findByUserAndAgent(userId, agentId);
    const wasEnabled = previousUserAgent?.isEnabled === true;

    const updates: Partial<UpdateUserAgentDto> = {};
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;
    if (requiresModeration !== undefined) updates.requiresModeration = requiresModeration;

    await this.userAgentsRepo.update(userId, agentId, updates);

    // Promo Code Agent specific: orchestrate the WooCommerce two-way sync lifecycle
    // when the agent's enabled state flips. All side effects are fire-and-forget so
    // the API response is not blocked.
    if (agent.type === AgentTypes.PROMO_CODE) {
      // ON enable: kick off the one-shot WC -> DD backfill (idempotent; no-ops if
      // `promoCodeAgentInitializedAt` is already set) AND register the WC webhooks
      // so subsequent merchant edits propagate in real time. registerCouponWebhooks
      // is itself idempotent — it skips topics that are already subscribed.
      if (isEnabled === true && !wasEnabled) {
        this.wooCommerceCouponSyncService.runFullBackfillOnEnable(userId).catch((error) =>
          // Backfill swallows errors internally and leaves the agent uninitialized so
          // a future enable retries. This catch only handles unexpected throws (e.g.
          // a database outage during the dedup map setup) so they don't surface as
          // unhandled promise rejections in the Node process.
          this.logger.error(
            `Promo code backfill kickoff failed for user ${userId}`,
            (error as Error).stack,
          ),
        );

        this.wooCommerceCouponWebhookService
          .registerCouponWebhooks(userId)
          .then((stats) =>
            this.logger.log(
              `Coupon webhook registration for user ${userId}: registered=${stats.registered}, skipped=${stats.skipped}, failed=${stats.failed}`,
            ),
          )
          .catch((error) =>
            this.logger.error(
              `Coupon webhook registration kickoff failed for user ${userId}`,
              (error as Error).stack,
            ),
          );
      }

      // ON disable: tear down the registered WC webhooks so the merchant's store
      // doesn't keep firing deliveries to an agent that's no longer reacting to
      // them. Local subscription rows are removed regardless of WC's response (a
      // stale row is harmless; an orphan WC webhook is something the operator can
      // clean up via the WP admin if WC was unreachable). We keep imported DD
      // configurations untouched so re-enabling later resumes from the same state.
      if (isEnabled === false && wasEnabled) {
        this.wooCommerceCouponWebhookService
          .unregisterCouponWebhooks(userId)
          .catch((error) =>
            this.logger.error(
              `Coupon webhook teardown failed for user ${userId}`,
              (error as Error).stack,
            ),
          );
      }
    }

    return { message: 'Agent settings updated successfully' };
  }

  async getSystemSettings(userId: string) {
    const settings = await this.systemSettingsRepo.findByUser(userId);
    if (!settings) throw new NotFoundException('Settings not found');
    return settings;
  }

  async updateSystemSettings(userId: string, dto: UpdateSystemSettingsDto) {
    const settings = await this.systemSettingsRepo.findByUser(userId);
    if (!settings) throw new NotFoundException('Settings not found');
    await this.systemSettingsRepo.update(userId, dto);
    return { message: 'System settings updated successfully' };
  }

  async getAgentSettings(agentType: AgentType, email: EmailEntity) {
    const userAgents = await this.agentsRepo.getAgentsForUser(email.userId);
    const currentAgent = userAgents.find((agent) => agent.type == agentType);
    return {
      isEnabled: currentAgent?.isEnabled,
      requiresModeration: currentAgent?.requiresModeration,
    };
  }

  async extractOrderNumber(email: EmailEntity): Promise<OrderExtractionResult> {
    const prompt = `
          Extract order number(s) from the following email. Look for patterns like:
          - Order #123
          - Order number: 123
          - #123
          - Order ID: 123

          Email Subject: ${email.subject}
          Email Body: ${email.body}

          Return JSON:
          {
            "orderNumbers": ["123"],
            "customerQuery": "brief summary of what customer is asking"
          }
          `;
    const messages = [
      {
        role: 'system',
        content: 'You are an expert at extracting order numbers from customer emails.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.1;
    const response_format = { type: 'json_object' };

    const response = await this.openaiService.createChatCompletion(
      messages,
      temperature,
      response_format,
    );

    return JSON.parse(response.choices[0].message.content || '{}');
  }

  async generateWismoPreview(userId: string, dto: WismoPreviewDto): Promise<WismoPreviewResponse> {
    const hasStore = await this.storeRepo.userHasStore(userId);
    if (!hasStore) {
      throw new NotFoundException(
        'Please connect your WooCommerce store before using WISMO preview',
      );
    }

    const isEmail = dto.query.includes('@');
    let order: any;

    try {
      if (isEmail) {
        order = await this.wooCommerceRestApiService.getMostRecentOrderByEmail(userId, dto.query);
        if (!order) {
          throw new NotFoundException(`No orders found for customer email: ${dto.query}`);
        }
      } else {
        order = await this.wooCommerceRestApiService.getOrderById(userId, dto.query);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error(error);
      throw new NotFoundException(`Order not found: ${dto.query}`);
    }

    const orderDetails = this.formatWooCommerceOrder(order);

    let tracking: any = null;

    if (orderDetails.trackingNumber && orderDetails.trackingProvider) {
      try {
        tracking = await this.aftershipService.createTracking(
          orderDetails.trackingNumber,
          orderDetails.trackingProvider,
          parseInt(orderDetails.orderId),
        );
      } catch (error) {
        // Continue without tracking
        console.log('Failed to fetch tracking, continuing without it:', error.message);
      }
    }

    let aiResponse: string;
    try {
      aiResponse = await this.generateAiResponseForWismo(orderDetails, tracking);
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate AI response');
    }

    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      from: user.email,
      to: orderDetails.customerInfo.email,
      subject: `Re: Order Status Inquiry - Order #${orderDetails.orderId}`,
      body: aiResponse,
    };
  }

  async generateProductPreview(
    userId: string,
    dto: ProductPreviewDto,
  ): Promise<ProductPreviewResponse> {
    return this.productAgentPreviewService.previewProductResponse(userId, dto);
  }

  /**
   * Returns every promo code configuration for the user as a flat array. This is the
   * original endpoint contract the production frontend depends on; do not change its
   * response shape. New consumers that need pagination should call
   * `getPaginatedPromoCodeConfigurations` (exposed at /promo-code/configurations/paginated).
   */
  async getPromoCodeConfigurations(userId: string): Promise<PromoCodeConfigurationResponse[]> {
    const rows = await this.promoCodeConfigsRepo.listByUserId(userId);
    return rows.map((row) => this.toPromoCodeConfigurationResponse(row));
  }

  /**
   * Paginated variant of getPromoCodeConfigurations. Lives on a separate route so the
   * existing /promo-code/configurations endpoint can keep returning a flat array
   * without breaking the production frontend. Mirrors the pagination envelope used
   * by the approval queue (`{ data, pagination }`).
   */
  async getPaginatedPromoCodeConfigurations(
    userId: string,
    dto: ListPromoCodeConfigurationsDto = {},
  ): Promise<PaginatedPromoCodeConfigurationsResponse> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    const { items, totalItems } = await this.promoCodeConfigsRepo.listByUserIdPaginated(userId, {
      offset,
      limit,
    });

    const totalPages = totalItems > 0 ? Math.ceil(totalItems / limit) : 0;

    return {
      data: items.map((row) => this.toPromoCodeConfigurationResponse(row)),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async createPromoCodeConfiguration(
    userId: string,
    dto: CreatePromoCodeConfigurationDto,
  ): Promise<PromoCodeConfigurationResponse> {
    this.validatePromoCodeConfig(dto);
    const created = await this.promoCodeConfigsRepo.create(
      this.mapPromoCodeConfigCreate(userId, dto),
    );
    // Best-effort one-way sync to WooCommerce. Failures are recorded on the row by
    // the sync service so the UI can surface them; we never block creation on WC.
    void this.wooCommerceCouponSyncService.syncOne(created);
    return this.toPromoCodeConfigurationResponse(created);
  }

  async syncPromoCodeConfigurations(userId: string): Promise<{ synced: number; failed: number }> {
    return this.wooCommerceCouponSyncService.syncAllForUser(userId);
  }

  async updatePromoCodeConfiguration(
    userId: string,
    configId: string,
    dto: UpdatePromoCodeConfigurationDto,
  ): Promise<PromoCodeConfigurationResponse> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'At least one field must be provided to update promo code config.',
      );
    }

    const existing = await this.promoCodeConfigsRepo.findByIdAndUserId(configId, userId);
    if (!existing) {
      throw new NotFoundException('Promo code configuration not found');
    }

    const mergedDto: UpdatePromoCodeConfigurationDto = {
      promoCode: existing.promoCode,
      description: existing.description ?? undefined,
      isActive: existing.isActive,
      usageType: this.normalizeUsageTypes(existing.usageType, existing.usageTypeLegacy),
      discountType: existing.discountType as (typeof promoCodeDiscountTypes)[number],
      discountPercentage: this.toNullableNumber(existing.discountPercentage),
      maxRefundAmount: this.toNullableNumber(existing.maxRefundAmount),
      validFrom: existing.validFrom?.toISOString(),
      validUntil: existing.validUntil?.toISOString(),
      minimumOrderValue: this.toNullableNumber(existing.minimumOrderValue),
      maxUsageCount: existing.maxUsageCount,
      appliesToSubscriptions: existing.appliesToSubscriptions,
      ...dto,
    };
    this.validatePromoCodeConfig(mergedDto);

    const updated = await this.promoCodeConfigsRepo.update(
      configId,
      userId,
      this.mapPromoCodeConfigUpdate(dto),
    );

    if (!updated) {
      throw new NotFoundException('Promo code configuration not found');
    }

    void this.wooCommerceCouponSyncService.syncOne(updated);
    return this.toPromoCodeConfigurationResponse(updated);
  }

  async deletePromoCodeConfiguration(
    userId: string,
    configId: string,
  ): Promise<{ message: string }> {
    const existing = await this.promoCodeConfigsRepo.findByIdAndUserId(configId, userId);
    if (!existing) {
      throw new NotFoundException('Promo code configuration not found');
    }

    const deleted = await this.promoCodeConfigsRepo.delete(configId, userId);
    if (!deleted) {
      throw new NotFoundException('Promo code configuration not found');
    }

    // Mirror the delete to WooCommerce so the storefront cannot keep redeeming a
    // coupon Delight Desk no longer manages. Failures are non-fatal because the
    // configuration is already gone from our system of record.
    void this.wooCommerceCouponSyncService.deleteRemote(existing);
    return { message: 'Promo code configuration deleted successfully' };
  }

  private formatWooCommerceOrder(order: any): OrderDetails {
    return {
      orderId: order.id.toString(),
      status: order.status,
      trackingNumber: order.meta_data?.find((m: any) => m.key === '_wc_shipment_tracking_items')
        ?.value?.[0]?.['tracking_number'],
      trackingProvider: order.meta_data?.find((m: any) => m.key === '_wc_shipment_tracking_items')
        ?.value?.[0]?.['tracking_provider'],
      customerInfo: {
        name: `${order.billing.first_name} ${order.billing.last_name}`,
        email: order.billing.email,
      },
      items: order.line_items.map((item: any) => ({
        name: item.name,
        quantity: item.quantity,
        total: item.total,
      })),
    };
  }

  private async generateAiResponseForWismo(
    orderDetails: OrderDetails,
    trackingDetails: any | null,
  ): Promise<string> {
    const prompt = `
      Generate an empathetic customer service response for this order status inquiry based on the available information.

      Order Information: ${JSON.stringify(orderDetails, null, 2)}

      Tracking Details: ${trackingDetails ? JSON.stringify(trackingDetails, null, 2) : 'No tracking information available yet'}

      Write a helpful, empathetic response that:
      1. Thanks the customer
      2. Provides clear order status
      3. Includes tracking details if available (tracking number, carrier, current status, estimated delivery)
      4. If no tracking available, explain that the order is being prepared and tracking will be available soon
      5. Sets expectations for delivery
      6. Offers help if needed
      7. Keep it under 300 tokens
      8. Do not include a signature or sign-off

      Important: Only include information that is actually available in the data provided above. Do not make up tracking numbers, delivery dates, or other details.
      `;

    const messages = [
      {
        role: 'system',
        content: 'You are a helpful customer service agent providing order status updates.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ];
    const temperature = 0.7;

    const response = await this.openaiService.createChatCompletion(messages, temperature);

    return response.choices[0].message.content || '';
  }

  private validatePromoCodeConfig(
    dto: CreatePromoCodeConfigurationDto | UpdatePromoCodeConfigurationDto,
  ): void {
    if (dto.usageType !== undefined && dto.usageType.length === 0) {
      throw new BadRequestException('usageType must include at least one usage type');
    }

    if (dto.validFrom && dto.validUntil) {
      const validFromDate = new Date(dto.validFrom);
      const validUntilDate = new Date(dto.validUntil);
      if (validFromDate > validUntilDate) {
        throw new BadRequestException('validFrom must be before validUntil');
      }
    }

    if (dto.discountType === 'percentage' && dto.discountPercentage === null) {
      throw new BadRequestException(
        'discountPercentage cannot be null when discountType is percentage',
      );
    }
  }

  private mapPromoCodeConfigCreate(
    userId: string,
    dto: CreatePromoCodeConfigurationDto,
  ): Omit<PromoCodeConfigurationEntity, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      userId,
      promoCode: dto.promoCode.trim(),
      description: dto.description ?? null,
      isActive: dto.isActive ?? true,
      usageTypeLegacy: this.normalizeUsageTypes(dto.usageType)[0],
      usageType: this.normalizeUsageTypes(dto.usageType),
      discountType: dto.discountType ?? 'percentage',
      discountPercentage: this.toNullableString(dto.discountPercentage),
      maxRefundAmount: this.toNullableString(dto.maxRefundAmount),
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      minimumOrderValue: this.toNullableString(dto.minimumOrderValue),
      maxUsageCount: dto.maxUsageCount ?? null,
      appliesToSubscriptions: dto.appliesToSubscriptions ?? false,
      // Sync metadata starts empty; the WooCommerce coupon sync service populates these
      // asynchronously after the row is created.
      wooCommerceCouponId: null,
      lastSyncedAt: null,
      lastSyncError: null,
      // Restrictions blob is only populated for rows imported FROM WooCommerce that
      // carry features Delight Desk does not fully model. Manually-created rows always
      // start null since the merchant authored them with DD-native fields.
      wcRestrictionsRaw: null,
    };
  }

  private mapPromoCodeConfigUpdate(
    dto: UpdatePromoCodeConfigurationDto,
  ): Partial<Omit<PromoCodeConfigurationEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>> {
    return {
      ...(dto.promoCode !== undefined ? { promoCode: dto.promoCode.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.usageType !== undefined
        ? {
            usageTypeLegacy: this.normalizeUsageTypes(dto.usageType)[0],
            usageType: this.normalizeUsageTypes(dto.usageType),
          }
        : {}),
      ...(dto.discountType !== undefined ? { discountType: dto.discountType } : {}),
      ...(dto.discountPercentage !== undefined
        ? { discountPercentage: this.toNullableString(dto.discountPercentage) }
        : {}),
      ...(dto.maxRefundAmount !== undefined
        ? { maxRefundAmount: this.toNullableString(dto.maxRefundAmount) }
        : {}),
      ...(dto.validFrom !== undefined
        ? { validFrom: dto.validFrom ? new Date(dto.validFrom) : null }
        : {}),
      ...(dto.validUntil !== undefined
        ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null }
        : {}),
      ...(dto.minimumOrderValue !== undefined
        ? { minimumOrderValue: this.toNullableString(dto.minimumOrderValue) }
        : {}),
      ...(dto.maxUsageCount !== undefined ? { maxUsageCount: dto.maxUsageCount } : {}),
      ...(dto.appliesToSubscriptions !== undefined
        ? { appliesToSubscriptions: dto.appliesToSubscriptions }
        : {}),
    };
  }

  private toNullableString(value: number | null | undefined): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    return value.toString();
  }

  private toNullableNumber(value: string | number | null): number | null {
    if (value === null) {
      return null;
    }
    return Number(value);
  }

  private normalizeUsageTypes(
    usageType: readonly string[] | undefined | null,
    fallbackSingleType?: string | null,
  ): PromoCodeUsageType[] {
    if (!usageType || usageType.length === 0) {
      if (
        fallbackSingleType &&
        (promoCodeUsageTypes as readonly string[]).includes(fallbackSingleType)
      ) {
        return [fallbackSingleType as PromoCodeUsageType];
      }
      return ['first_time_customer_discount'];
    }

    const normalized = usageType
      .map((value) => value?.trim())
      .filter(
        (value): value is PromoCodeUsageType =>
          !!value && (promoCodeUsageTypes as readonly string[]).includes(value),
      );

    return normalized.length > 0 ? normalized : ['first_time_customer_discount'];
  }

  private toPromoCodeConfigurationResponse(
    row: PromoCodeConfigurationEntity,
  ): PromoCodeConfigurationResponse {
    return {
      id: row.id,
      userId: row.userId,
      promoCode: row.promoCode,
      description: row.description,
      isActive: row.isActive,
      usageType: this.normalizeUsageTypes(row.usageType, row.usageTypeLegacy),
      discountType: row.discountType,
      discountPercentage: row.discountPercentage,
      maxRefundAmount: row.maxRefundAmount,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      minimumOrderValue: row.minimumOrderValue,
      maxUsageCount: row.maxUsageCount,
      appliesToSubscriptions: row.appliesToSubscriptions,
      wooCommerceCouponId: row.wooCommerceCouponId,
      lastSyncedAt: row.lastSyncedAt,
      lastSyncError: row.lastSyncError,
      wcRestrictionsRaw: row.wcRestrictionsRaw ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
