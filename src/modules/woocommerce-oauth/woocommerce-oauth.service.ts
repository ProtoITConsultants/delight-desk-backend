import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { UserStoreConnectionsRepository } from './user-store-connections.repository';
import { InitializeWooOAuthDto, ManualConnectWooDto } from './dto/index.dto';
import { ConfigService } from '@nestjs/config';
import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

@Injectable()
export class WooCommerceOAuthService {
  constructor(
    private readonly storeRepo: UserStoreConnectionsRepository,
    private readonly configService: ConfigService,
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
      throw new BadRequestException('No WooCommerce OAuth connection found for this user');
    }
    await this.storeRepo.delete(connection.id, userId);
    return { message: 'WooCommerce OAuth connection deleted successfully' };
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
