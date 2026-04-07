import { AgentsService } from './agents.service';
import {
  ProductPreviewDto,
  UpdateSystemSettingsDto,
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
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RateLimitInterceptor } from 'src/interceptors/rate-limit.interceptor';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Agents')
@ApiCookieAuth('connect.sid')
@UseGuards(SessionGuard)
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all agents for user',
    description:
      'Retrieve all AI agents configured for the current user with their settings and status',
  })
  @ApiResponse({ status: 200, description: 'Agents list retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getAgentsForUser(@CurrentUserId() userId: string) {
    return this.agentsService.getAgentsForUser(userId);
  }

  @Get('/settings')
  @ApiOperation({
    summary: 'Get system settings',
    description: 'Retrieve system-wide agent settings for the current user',
  })
  @ApiResponse({ status: 200, description: 'System settings retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getSettings(@CurrentUserId() userId: string) {
    return this.agentsService.getSystemSettings(userId);
  }

  @Patch('/settings')
  @ApiOperation({
    summary: 'Update system settings',
    description: 'Update system-wide agent settings such as tracking plugin configuration',
  })
  @ApiBody({ type: UpdateSystemSettingsDto })
  @ApiResponse({
    status: 200,
    description: 'System settings updated successfully',
    schema: {
      type: 'object',
      properties: { message: { type: 'string', example: 'System settings updated successfully' } },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  updateSettings(@Body() dto: UpdateSystemSettingsDto, @CurrentUserId() userId: string) {
    return this.agentsService.updateSystemSettings(userId, dto);
  }

  @Patch(':agentId')
  @ApiOperation({
    summary: 'Update agent settings',
    description:
      'Update settings for a specific AI agent including enabled status and moderation requirements',
  })
  @ApiParam({ name: 'agentId', type: String, description: 'Agent ID to update' })
  @ApiBody({ type: UpdateUserAgentDto })
  @ApiResponse({ status: 200, description: 'Agent settings updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  updateUserAgent(
    @Param('agentId') agentId: string,
    @CurrentUserId() userId: string,
    @Body() body: UpdateUserAgentDto,
  ) {
    return this.agentsService.updateUserAgentSettings(userId, agentId, body);
  }

  @Post('/wismo/preview')
  @ApiOperation({
    summary: 'Generate WISMO response preview',
    description:
      'Generate a preview of the "Where Is My Order" (WISMO) agent response for testing. Rate limited to 5 requests.',
  })
  @ApiBody({ type: WismoPreviewDto })
  @ApiResponse({ status: 200, description: 'WISMO preview generated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid query format' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 429, description: 'Too many requests - Rate limit exceeded' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @RateLimit('wismo-preview', 5)
  @UseGuards(RateLimitGuard)
  @UseInterceptors(RateLimitInterceptor)
  previewWismoResponse(@CurrentUserId() userId: string, @Body() dto: WismoPreviewDto) {
    return this.agentsService.generateWismoPreview(userId, dto);
  }

  @Post('/product/preview')
  @ApiOperation({
    summary: 'Generate Product Agent response preview',
    description:
      'Generate a high-fidelity Product Agent preview using classification, retrieval quality gates, and product response generation. Rate limited to 5 requests.',
  })
  @ApiBody({ type: ProductPreviewDto })
  @ApiResponse({ status: 200, description: 'Product preview generated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid preview payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 429, description: 'Too many requests - Rate limit exceeded' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @RateLimit('product-preview', 5)
  @UseGuards(RateLimitGuard)
  @UseInterceptors(RateLimitInterceptor)
  previewProductResponse(@CurrentUserId() userId: string, @Body() dto: ProductPreviewDto) {
    return this.agentsService.generateProductPreview(userId, dto);
  }
}
