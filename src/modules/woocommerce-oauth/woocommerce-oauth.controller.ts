import { Controller, Get, Query, Body, Post, BadRequestException, Req, Delete } from '@nestjs/common';
import { WooCommerceOAuthService } from './woocommerce-oauth.service';
import { CreateWooCommerceOAuthDto } from './dto/create-woocommerce-oauth.dto';

@Controller('woocommerce-oauth')
export class WooCommerceOAuthController {
  constructor(private readonly wooOAuthService: WooCommerceOAuthService) {}

  @Post('init')
  async initOAuth(@Body() body: CreateWooCommerceOAuthDto, @Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }

    return this.wooOAuthService.getAuthorizationUrl(userId, body);
  }

  @Get('callback')
  async handleCallback(@Query() query: any) {
    const { oauth_token, oauth_verifier } = query;

    if (!oauth_token || !oauth_verifier) {
      throw new BadRequestException('Missing oauth_token or oauth_verifier');
    }

    return this.wooOAuthService.handleCallback(oauth_token, oauth_verifier);
  }

  @Delete('disconnect')
  async disconnectWooCommerce(@Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.wooOAuthService.disconnectWooCommerce(userId);
  }

}
