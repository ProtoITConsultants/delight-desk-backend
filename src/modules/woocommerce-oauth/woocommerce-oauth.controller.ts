import {
  Controller,
  Body,
  Post,
  Delete,
  UseGuards,
  Response,
  Get,
  Res,
  Redirect,
} from '@nestjs/common';
import { WooCommerceOAuthService } from './woocommerce-oauth.service';
import { InitializeWooOAuthDto, ManualConnectWooDto } from './dto/index.dto';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

@Controller('woocommerce')
export class WooCommerceOAuthController {
  constructor(
    private readonly wooOAuthService: WooCommerceOAuthService,
    private readonly configService: ConfigService,
  ) {}

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
