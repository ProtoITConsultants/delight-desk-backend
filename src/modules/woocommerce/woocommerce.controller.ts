import { SessionGuard } from 'src/guards/session.guard';
import { WooCommerceService } from './woocommerce.service';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { InitializeWooOAuthDto, ManualConnectWooDto } from './dto/index.dto';
import { Body, Controller, Delete, Get, Post, Res, Response, UseGuards } from '@nestjs/common';

@Controller('woocommerce')
export class WooCommerceController {
  constructor(private readonly wooCommerceService: WooCommerceService) {}

  @UseGuards(SessionGuard)
  @Post('init-oauth')
  async initOAuth(@CurrentUserId() userId: string, @Body() body: InitializeWooOAuthDto) {
    return this.wooCommerceService.initializeOAuth(userId, body);
  }

  @Post('callback')
  async handleCallback(@Body() body: any, @Response() res: any) {
    await this.wooCommerceService.handleCallback(body);
    return res.redirect(process.env.FRONTEND_CONNECTIONS_PAGE_URL);
  }

  @Get('callback')
  async handleCallbackGet(@Res() res: any) {
    return res.redirect(process.env.FRONTEND_CONNECTIONS_PAGE_URL);
  }

  @UseGuards(SessionGuard)
  @Post('manual-connect')
  async manualConnect(@CurrentUserId() userId: string, @Body() body: ManualConnectWooDto) {
    return this.wooCommerceService.manualConnect(userId, body);
  }

  @UseGuards(SessionGuard)
  @Delete('disconnect')
  disconnectWooCommerce(@CurrentUserId() userId: string) {
    return this.wooCommerceService.disconnectWooCommerce(userId);
  }
}
