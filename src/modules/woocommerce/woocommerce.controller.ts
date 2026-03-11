import { SessionGuard } from 'src/guards/session.guard';
import { WooCommerceService } from './woocommerce.service';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { InitializeWooOAuthDto, ManualConnectWooDto, GetOrdersQueryDto } from './dto/index.dto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  Response,
  UseGuards,
} from '@nestjs/common';
import { WooCommerceRestApiService } from './woocommerce-rest-api.service';
import {
  ApiBody,
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('WooCommerce')
@Controller('woocommerce')
export class WooCommerceController {
  constructor(
    private readonly wooCommerceService: WooCommerceService,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
  ) {}

  @UseGuards(SessionGuard)
  @Post('init-oauth')
  @ApiOperation({
    summary: 'Initialize WooCommerce OAuth',
    description: 'Start the WooCommerce OAuth flow to connect a store',
  })
  @ApiCookieAuth('connect.sid')
  @ApiBody({ type: InitializeWooOAuthDto })
  @ApiResponse({ status: 201, description: 'OAuth flow initiated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid store URL' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async initOAuth(@CurrentUserId() userId: string, @Body() body: InitializeWooOAuthDto) {
    return this.wooCommerceService.initializeOAuth(userId, body);
  }

  @Post('callback')
  @ApiExcludeEndpoint()
  async handleCallback(@Body() body: any, @Response() res: any) {
    await this.wooCommerceService.handleCallback(body);
    return res.redirect(process.env.FRONTEND_CONNECTIONS_PAGE_URL);
  }

  @Get('callback')
  @ApiExcludeEndpoint()
  async handleCallbackGet(@Res() res: any) {
    return res.redirect(process.env.FRONTEND_CONNECTIONS_PAGE_URL);
  }

  @UseGuards(SessionGuard)
  @Post('manual-connect')
  @ApiOperation({
    summary: 'Manually connect WooCommerce store',
    description: 'Connect to a WooCommerce store using manually generated API keys',
  })
  @ApiCookieAuth('connect.sid')
  @ApiBody({ type: ManualConnectWooDto })
  @ApiResponse({ status: 201, description: 'Store connected successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid credentials or store URL' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async manualConnect(@CurrentUserId() userId: string, @Body() body: ManualConnectWooDto) {
    return this.wooCommerceService.manualConnect(userId, body);
  }

  @UseGuards(SessionGuard)
  @Delete('disconnect')
  @ApiOperation({
    summary: 'Disconnect WooCommerce store',
    description: 'Disconnect the linked WooCommerce store from the user account',
  })
  @ApiCookieAuth('connect.sid')
  @ApiResponse({ status: 200, description: 'Store disconnected successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'WooCommerce connection not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  disconnectWooCommerce(@CurrentUserId() userId: string) {
    return this.wooCommerceService.disconnectWooCommerce(userId);
  }

  @UseGuards(SessionGuard)
  @Get('order')
  @ApiOperation({
    summary: 'Fetch orders',
    description: 'Fetch orders from the connected WooCommerce store. Optionally filter by status and use pagination.',
  })
  @ApiCookieAuth('connect.sid')
  @ApiResponse({ status: 200, description: 'List of orders' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'WooCommerce connection not found' })
  getOrders(@CurrentUserId() userId: string, @Query() query: GetOrdersQueryDto) {
    return this.wooCommerceRestApiService.getOrders(userId, {
      status: query.status,
      page: query.page,
      perPage: query.perPage,
    });
  }

  @UseGuards(SessionGuard)
  @Get('order/:customerEmail/recent')
  @ApiExcludeEndpoint()
  getMostRecentOrderByEmail(
    @CurrentUserId() userId: string,
    @Param('customerEmail') customerEmail: string,
  ) {
    return this.wooCommerceRestApiService.getMostRecentOrderByEmail(userId, customerEmail);
  }

  @UseGuards(SessionGuard)
  @Get('order/:orderId')
  @ApiOperation({
    summary: 'Get order by ID',
    description: 'Fetch a single order by its WooCommerce order ID',
  })
  @ApiCookieAuth('connect.sid')
  @ApiResponse({ status: 200, description: 'Order details' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Order or WooCommerce connection not found' })
  getOrderById(@CurrentUserId() userId: string, @Param('orderId') orderId: string) {
    return this.wooCommerceRestApiService.getOrderById(userId, orderId);
  }
}
