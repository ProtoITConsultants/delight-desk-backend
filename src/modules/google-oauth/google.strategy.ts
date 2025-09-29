import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: process.env.GOOGLE_SCOPES
        ? process.env.GOOGLE_SCOPES.split(',').map((s) => s.trim())
        : ['openid', 'email', 'profile'],
      passReqToCallback: false,
    });
  }

  authorizationParams(): any {
    return {
      access_type: 'offline',
      prompt: 'consent',
    };
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    params: any,
    profile: any,
  ): Promise<any> {
    const { displayName, emails, photos } = profile;
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const googleAccount = {
      provider: 'google',
      providerUserId: params.id,
      email: emails?.[0]?.value,
      displayName,
      avatarUrl: photos?.[0]?.value,
      accessToken,
      refreshToken,
      expiresAt,
    };

    return googleAccount;
  }
}
