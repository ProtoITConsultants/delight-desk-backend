import { Injectable } from '@nestjs/common';
import { GoogleOauthRepository } from '../google-oauth/google-oauth.repository';

@Injectable()
export class ConnectionsService {
  constructor(private readonly googleOauthRepo: GoogleOauthRepository) {}

  async getConnectionsDetail(userId: string) {
    const gmailConnectionDetail = await this.googleOauthRepo.getGoogleAccount(userId);
    const connectionsDetailTemplate = {
      wooCommerce: null,
      gmail: gmailConnectionDetail
        ? { status: gmailConnectionDetail.status, email: gmailConnectionDetail.email }
        : null,
      outlook: null,
      shipbob: null,
      shipstation: null,
    };

    return connectionsDetailTemplate;
  }
}
