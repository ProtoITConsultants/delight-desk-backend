import { AgentType, AgentTypes } from 'src/common/agent-types';
import { WooCommerceService } from '../woocommerce/woocommerce.service';
import { WooCommerceRestApiService } from '../woocommerce/woocommerce-rest-api.service';
import { AgentsRepository } from 'src/database/repos/agents.repository';
import {
  ProductPreviewDto,
  ProductPreviewResponse,
  UpdateSystemSettingsDto,
  UpdateUserAgentDto,
  WismoPreviewDto,
  WismoPreviewResponse,
} from './agents.dto';
import { ProductAgentPreviewService } from './product-agent-preview.service';
import { UserAgentsRepository } from 'src/database/repos/user-agents.repository';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { UserStoreConnectionsRepository } from 'src/database/repos/user-store-connections.repository';
import { UserRepository } from 'src/database/repos/users.repository';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EmailEntity } from '../../database/schema';
import { OpenAIService } from '../openai/openai.service';
import { OrderDetails, OrderExtractionResult } from '../temporal/workflows/types';
import { AftershipService } from '../aftership/aftership.service';

@Injectable()
export class AgentsService {
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

    const updates: Partial<UpdateUserAgentDto> = {};
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;
    if (requiresModeration !== undefined) updates.requiresModeration = requiresModeration;

    await this.userAgentsRepo.update(userId, agentId, updates);

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
    let hasTracking = false;

    if (orderDetails.trackingNumber && orderDetails.trackingProvider) {
      try {
        tracking = await this.aftershipService.createTracking(
          orderDetails.trackingNumber,
          orderDetails.trackingProvider,
          parseInt(orderDetails.orderId),
        );
        hasTracking = true;
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
      signature: '',
      orderDetails: {
        orderId: orderDetails.orderId,
        status: orderDetails.status,
        trackingNumber: orderDetails.trackingNumber,
      },
      hasTracking,
    };
  }

  async generateProductPreview(
    userId: string,
    dto: ProductPreviewDto,
  ): Promise<ProductPreviewResponse> {
    return this.productAgentPreviewService.previewProductResponse(userId, dto);
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
}
