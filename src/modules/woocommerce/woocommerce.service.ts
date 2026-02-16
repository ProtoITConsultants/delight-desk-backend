import { ConfigService } from '@nestjs/config';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { WooCommerceRestApiService } from './woocommerce-rest-api.service';
import { InitializeWooOAuthDto, ManualConnectWooDto } from './dto/index.dto';
import { UserStoreConnectionsRepository } from '../../database/repos/user-store-connections.repository';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

@Injectable()
export class WooCommerceService {
  constructor(
    private readonly configService: ConfigService,
    private readonly storeRepo: UserStoreConnectionsRepository,
    private readonly wooCommerceRestApiService: WooCommerceRestApiService,
  ) {}

  async initializeOAuth(userId: string, body: InitializeWooOAuthDto) {
    if (await this.storeRepo.userHasStore(userId)) {
      throw new ConflictException('Store already exists');
    }

    const storeUrl = this.sanitizeStoreUrl(body.storeUrl);
    const requestTokenUrl = `${storeUrl}wc-auth/v1/authorize`;
    const callbackUrl = this.configService.get('WOOCOMMERCE_OAUTH_CALLBACK_URL');

    const payload = {
      userId,
      storeUrl,
    };

    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');

    const redirectUrl =
      requestTokenUrl +
      `?app_name=DelightDesk` +
      `&scope=read_write` +
      `&user_id=${encodeURIComponent(encoded)}` +
      `&return_url=${encodeURIComponent(callbackUrl)}` +
      `&callback_url=${encodeURIComponent(callbackUrl)}`;

    return {
      redirectUrl,
    };
  }

  async handleCallback(body: any) {
    const { user_id, consumer_key, consumer_secret } = body;

    const decoded = JSON.parse(Buffer.from(user_id, 'base64').toString('utf8'));

    await this.storeRepo.create({
      userId: decoded.userId,
      platform: 'woocommerce',
      storeUrl: decoded.storeUrl,
      connectionMethod: 'oauth',
      apiKey: consumer_key,
      apiSecret: consumer_secret,
      isActive: true,
    });
  }

  async manualConnect(userId: string, body: ManualConnectWooDto) {
    if (await this.storeRepo.userHasStore(userId)) {
      throw new ConflictException('Store already exists');
    }

    const { storeUrl, consumerKey, consumerSecret } = body;
    const sanitizedUrl = this.sanitizeStoreUrl(storeUrl);

    const wc = new WooCommerceRestApi({
      url: sanitizedUrl,
      consumerKey,
      consumerSecret,
      version: 'wc/v3',
    });

    try {
      await wc.get('system_status');
    } catch (err: any) {
      console.log({ err });
      const message = err?.response?.data?.message || 'Invalid WooCommerce credentials';
      throw new BadRequestException(message);
    }

    await this.storeRepo.create({
      userId,
      platform: 'woocommerce',
      storeUrl: sanitizedUrl,
      connectionMethod: 'manual',
      apiKey: consumerKey,
      apiSecret: consumerSecret,
      isActive: true,
    });

    return { message: 'WooCommerce store connected successfully' };
  }

  async disconnectWooCommerce(userId: string) {
    const connection = await this.storeRepo.findByPlatform(userId, 'woocommerce');

    if (!connection) {
      throw new BadRequestException('No WooCommerce Auth connection found for this user');
    }
    await this.storeRepo.delete(connection.id, userId);
    return { message: 'WooCommerce Auth connection deleted successfully' };
  }

  async getWoocommerceTrackingPluginStatus(
    userId: string,
  ): Promise<{ status: 'active' | 'inactive' }> {
    const perPage = 100;
    const totalToCheck = 40;
    let ordersWithTrackingNumber = 0;

    try {
      while (ordersWithTrackingNumber < totalToCheck) {
        const orders = await this.wooCommerceRestApiService.getOrders(userId, perPage);

        if (!orders || orders.length === 0) break;

        for (const order of orders) {
          const hasTracking = order.meta_data?.some(
            (md) => md?.key === '_wc_shipment_tracking_items',
          );
          if (hasTracking) {
            ordersWithTrackingNumber++;
            if (ordersWithTrackingNumber >= totalToCheck) break;
          }
        }
      }

      return { status: ordersWithTrackingNumber >= totalToCheck ? 'active' : 'inactive' };
    } catch (error) {
      console.error('Error fetching WooCommerce orders:', error);
      throw new InternalServerErrorException('Failed to get WooCommerce tracking plugin status');
    }
  }

  sanitizeStoreUrl(url: string) {
    let clean = url.trim();
    if (!clean.startsWith('http')) {
      throw new BadRequestException('Invalid store URL');
    }
    if (!clean.endsWith('/')) clean += '/';
    return clean;
  }
}
