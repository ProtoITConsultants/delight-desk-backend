import { AgentsService } from './agents.service';
import {
  CreatePromoCodeConfigurationDto,
  ListPromoCodeConfigurationsDto,
  ProductPreviewDto,
  UpdateSystemSettingsDto,
  UpdatePromoCodeConfigurationDto,
  UpdateUserAgentDto,
  WismoPreviewDto,
} from './agents.dto';
import { SessionGuard } from 'src/guards/session.guard';
import { RateLimitGuard } from 'src/guards/rate-limit.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { RateLimit } from 'src/decorators/rate-limit.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  Delete,
} from '@nestjs/common';
import { RateLimitInterceptor } from 'src/interceptors/rate-limit.interceptor';

@UseGuards(SessionGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  getAgentsForUser(@CurrentUserId() userId: string) {
    return this.agentsService.getAgentsForUser(userId);
  }

  @Get('/settings')
  getSettings(@CurrentUserId() userId: string) {
    return this.agentsService.getSystemSettings(userId);
  }

  @Patch('/settings')
  updateSettings(@Body() dto: UpdateSystemSettingsDto, @CurrentUserId() userId: string) {
    return this.agentsService.updateSystemSettings(userId, dto);
  }

  @Patch(':agentId')
  updateUserAgent(
    @Param('agentId') agentId: string,
    @CurrentUserId() userId: string,
    @Body() body: UpdateUserAgentDto,
  ) {
    return this.agentsService.updateUserAgentSettings(userId, agentId, body);
  }

  @Post('/wismo/preview')
  @RateLimit('wismo-preview', 5)
  @UseGuards(RateLimitGuard)
  @UseInterceptors(RateLimitInterceptor)
  previewWismoResponse(@CurrentUserId() userId: string, @Body() dto: WismoPreviewDto) {
    return this.agentsService.generateWismoPreview(userId, dto);
  }

  @Post('/product/preview')
  // @RateLimit('product-preview', 5)
  // @UseGuards(RateLimitGuard)
  // @UseInterceptors(RateLimitInterceptor)
  previewProductResponse(@CurrentUserId() userId: string, @Body() dto: ProductPreviewDto) {
    return this.agentsService.generateProductPreview(userId, dto);
  }

  /**
   * Original list endpoint — returns a flat array of every promo code configuration
   * for the user. Kept stable because the production frontend consumes this shape.
   * New consumers that need pagination should call /promo-code/configurations/paginated.
   */
  @Get('/promo-code/configurations')
  getPromoCodeConfigurations(@CurrentUserId() userId: string) {
    return this.agentsService.getPromoCodeConfigurations(userId);
  }

  /**
   * Paginated list endpoint. Returns `{ data, pagination }` matching the shape used
   * by the approval queue. Frontend integration is tracked separately on the backlog.
   */
  @Get('/promo-code/configurations/paginated')
  getPaginatedPromoCodeConfigurations(
    @CurrentUserId() userId: string,
    @Query() dto: ListPromoCodeConfigurationsDto,
  ) {
    return this.agentsService.getPaginatedPromoCodeConfigurations(userId, dto);
  }

  @Post('/promo-code/configurations')
  createPromoCodeConfiguration(
    @CurrentUserId() userId: string,
    @Body() dto: CreatePromoCodeConfigurationDto,
  ) {
    return this.agentsService.createPromoCodeConfiguration(userId, dto);
  }

  @Patch('/promo-code/configurations/:configId')
  updatePromoCodeConfiguration(
    @CurrentUserId() userId: string,
    @Param('configId') configId: string,
    @Body() dto: UpdatePromoCodeConfigurationDto,
  ) {
    return this.agentsService.updatePromoCodeConfiguration(userId, configId, dto);
  }

  @Delete('/promo-code/configurations/:configId')
  deletePromoCodeConfiguration(
    @CurrentUserId() userId: string,
    @Param('configId') configId: string,
  ) {
    return this.agentsService.deletePromoCodeConfiguration(userId, configId);
  }

  @Post('/promo-code/configurations/sync')
  syncPromoCodeConfigurations(@CurrentUserId() userId: string) {
    return this.agentsService.syncPromoCodeConfigurations(userId);
  }
}
