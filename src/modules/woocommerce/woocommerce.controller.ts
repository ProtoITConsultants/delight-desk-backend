import { SessionGuard } from 'src/guards/session.guard';
import { WooCommerceService } from './woocommerce.service';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { InitializeWooOAuthDto, ManualConnectWooDto } from './dto/index.dto';
import { Controller, Body, Post, Delete, UseGuards, Response, Get, Res } from '@nestjs/common';

@Controller('woocommerce')
export class WooCommerceController {
  constructor(private readonly wooOAuthService: WooCommerceService) {}

  @UseGuards(SessionGuard)
  @Post('init-oauth')
  async initOAuth(@CurrentUserId() userId: string, @Body() body: InitializeWooOAuthDto) {
    return this.wooOAuthService.initializeOAuth(userId, body);
  }

  @Post('callback')
  async handleCallback(@Body() body: any, @Response() res: any) {
    await this.wooOAuthService.handleCallback(body);
    return res.redirect(process.env.FRONTEND_CONNECTIONS_PAGE_URL);
  }

  @Get('callback')
  async handleCallbackGet(@Res() res: any) {
    return res.redirect(process.env.FRONTEND_CONNECTIONS_PAGE_URL);
  }

  @UseGuards(SessionGuard)
  @Post('manual-connect')
  async manualConnect(@CurrentUserId() userId: string, @Body() body: ManualConnectWooDto) {
    return this.wooOAuthService.manualConnect(userId, body);
  }

  @UseGuards(SessionGuard)
  @Delete('disconnect')
  async disconnectWooCommerce(@CurrentUserId() userId: string) {
    return this.wooOAuthService.disconnectWooCommerce(userId);
  }
}
