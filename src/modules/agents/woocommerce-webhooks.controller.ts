import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WooCommerceCouponWebhookService } from './woocommerce-coupon-webhook.service';

/**
 * Receives WooCommerce coupon webhook deliveries. The route is intentionally
 * unauthenticated by SessionGuard — WooCommerce won't have a session cookie. Auth
 * is via the per-user secret in the body's HMAC-SHA256 signature, which the service
 * verifies before doing any DB writes.
 *
 * Why a query param for userId: WooCommerce signs the delivery with the secret tied
 * to the registration, so a forged URL with a different `u=` would fail signature
 * verification (the attacker doesn't know the secret). We need *some* way to look
 * up the secret server-side; the user id in the URL is the simplest tenant pointer
 * that doesn't leak anything sensitive.
 */
@Controller('woocommerce/webhooks')
export class WooCommerceWebhooksController {
  private readonly logger = new Logger(WooCommerceWebhooksController.name);

  constructor(private readonly couponWebhookService: WooCommerceCouponWebhookService) {}

  @Post('coupons')
  @HttpCode(200) // WooCommerce treats anything but 2xx as a delivery failure and retries.
  async handleCouponWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-wc-webhook-signature') signature: string | undefined,
    @Headers('x-wc-webhook-topic') topic: string | undefined,
    @Headers('x-wc-webhook-source') source: string | undefined,
    @Query('u') userId: string | undefined,
    @Body() payload: any,
  ): Promise<{ ok: boolean; action: string }> {
    if (!userId) {
      throw new BadRequestException('Missing user identifier');
    }
    if (!topic) {
      throw new BadRequestException('Missing topic header');
    }
    if (!req.rawBody) {
      // rawBody is enabled globally in main.ts; if it's missing here something
      // upstream is parsing the body before we get to it.
      throw new BadRequestException('Missing raw request body');
    }
    if (!signature) {
      throw new UnauthorizedException('Missing signature header');
    }

    const outcome = await this.couponWebhookService.handleIncomingCouponEvent({
      userId,
      topic,
      signatureHeader: signature,
      sourceHeader: source,
      rawBody: req.rawBody,
      payload,
    });

    if (!outcome.ok) {
      // Failed-but-not-throwing outcomes (skipped_malformed, skipped_no_match) still
      // return 200 to WC so it doesn't mark the delivery as failed and retry. We just
      // log the reason for diagnostics.
      this.logger.warn(
        `Coupon webhook (user=${userId} topic=${topic}) skipped: ${outcome.reason ?? outcome.action}`,
      );
    } else {
      this.logger.log(
        `Coupon webhook (user=${userId} topic=${topic}) action=${outcome.action}${outcome.configId ? ` config=${outcome.configId}` : ''}`,
      );
    }

    return { ok: outcome.ok, action: outcome.action };
  }
}
