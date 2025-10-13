import { Injectable } from '@nestjs/common';
import { GoogleOauthRepository } from '../google-oauth/google-oauth.repository';
import { MicrosoftOauthRepository } from '../microsoft-oauth/microsoft-oauth.repository';

@Injectable()
export class ConnectionsService {
  constructor(
    private readonly googleOauthRepo: GoogleOauthRepository,
    private readonly msOauthRepo: MicrosoftOauthRepository,
  ) {}

  async getConnectionsDetail(userId: string) {
    const gmailConnectionDetail = await this.googleOauthRepo.getGoogleAccount(userId);
    const outlookConnectionDetail = await this.msOauthRepo.getMicrosoftAccount(userId);

    const connectionsDetailTemplate = {
      wooCommerce: null,
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
