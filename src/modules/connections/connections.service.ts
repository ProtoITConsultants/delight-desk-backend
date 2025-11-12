import { Injectable } from '@nestjs/common';
import { GoogleOauthRepository } from '../google-oauth/google-oauth.repository';
import { MicrosoftOauthRepository } from '../microsoft-oauth/microsoft-oauth.repository';
import { StoreConnectionsRepository } from '../store-connections/store-connections.repository';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly storeRepo: StoreConnectionsRepository,
    private readonly googleOauthRepo: GoogleOauthRepository,
    private readonly msOauthRepo: MicrosoftOauthRepository,
  ) {}

  async getConnectionsDetail(userId: string) {
    const gmailConnectionDetail = await this.googleOauthRepo.getGoogleAccount(userId);
    const outlookConnectionDetail = await this.msOauthRepo.getMicrosoftAccount(userId);
    // WooCommerce connection
    const wooConnection = await this.storeRepo.findByPlatform(userId, 'woocommerce');

    const connectionsDetailTemplate = {
      wooCommerce: wooConnection
      ? {
          status: wooConnection.is_active ? 'connected' : 'disconnected',
          storeName: wooConnection.store_name,
          storeUrl: wooConnection.store_url,
        }
      : null,
      gmail: gmailConnectionDetail
        ? { status: gmailConnectionDetail.status, email: gmailConnectionDetail.email }
        : null,
      outlook: outlookConnectionDetail
        ? { status: outlookConnectionDetail.status, email: outlookConnectionDetail.email }
        : null,
      shipbob: null,
      shipstation: null,
    };

    return connectionsDetailTemplate;
  }
}
