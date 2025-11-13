import { Injectable, BadRequestException } from '@nestjs/common';
import OAuth from 'oauth-1.0a';
import * as crypto from 'crypto';
import axios from 'axios';
import { StoreConnectionsRepository } from '../store-connections/store-connections.repository';
import { CreateWooCommerceOAuthDto } from './dto/create-woocommerce-oauth.dto';

@Injectable()
export class WooCommerceOAuthService {
  constructor(private readonly storeRepo: StoreConnectionsRepository) {}

  async getAuthorizationUrl(userId: string, body: CreateWooCommerceOAuthDto) {
    const { storeUrl, consumerKey, consumerSecret } = body;

    if (!storeUrl || !consumerKey || !consumerSecret) {
      throw new BadRequestException('Missing required WooCommerce credentials');
    }

    const oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
      },
    });

    const requestTokenUrl = `${storeUrl}/wc-auth/v1/authorize`;

    // const callbackUrl = `${process.env.BACKEND_URL}/woocommerce-oauth/callback`;
    const callbackUrl = `https://api.delightdesk.io/woocommerce-oauth/callback`;

    // Build redirect URL
    const redirectUrl = `${requestTokenUrl}?app_name=DelightDesk&scope=read_write&user_id=${userId}&return_url=${callbackUrl}&callback_url=${callbackUrl}`;

    // Save the connection (initial entry)
    await this.storeRepo.create({
      userid: userId,
      platform: 'woocommerce',
      store_name: body.storeName || new URL(body.storeUrl).hostname,
      store_url: storeUrl,
      api_key: consumerKey,
      api_secret: consumerSecret,
      connection_method: 'oauth',
      is_active: false,
    });

    return { redirectUrl };
  }

  async handleCallback(oauth_token: string, oauth_verifier: string) {
  // Find the store connection by oauth_token
    const connection = await this.storeRepo.findByOAuthToken(oauth_token);
    if (!connection) {
      throw new BadRequestException('No matching store connection found');
    }
    // Update the OAuth tokens and mark as active
    await this.storeRepo.updateOAuthTokens(connection.id, connection.userid, {
      oauth_token,
      oauth_verifier,
      is_active: true,
    });

    return { message: 'WooCommerce store connected successfully' };
  }

  async disconnectWooCommerce(userId: string) {
    const connection = await this.storeRepo.findByPlatformAndMethod(
      userId,
      'woocommerce',
      'oauth',
    );

    if (!connection) {
      throw new BadRequestException('No WooCommerce OAuth connection found for this user');
    }
    await this.storeRepo.delete(connection.id, userId);
    return { message: 'WooCommerce OAuth connection deleted successfully' };
  }
}
