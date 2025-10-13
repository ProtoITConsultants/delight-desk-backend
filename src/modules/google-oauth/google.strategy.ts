import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { Request } from 'express';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: process.env.GOOGLE_SCOPES
        ? process.env.GOOGLE_SCOPES.split(',').map((s) => s.trim())
        : ['openid', 'email', 'profile'],
      passReqToCallback: true,
    });
  }

  authorizationParams(): any {
    return {
      access_type: 'offline',
      prompt: 'consent',
    };
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string | undefined,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, displayName, emails, photos } = profile;
    const email = emails?.[0]?.value || profile._json.email;

    if (!email) {
      return done(new UnauthorizedException('Email not provided by Google'), null);
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const googleAccount = {
      provider: 'google',
      providerUserId: id,
      email,
      displayName,
      avatarUrl: photos?.[0]?.value || profile._json.picture,
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt,
    };

    done(null, googleAccount);
  }
}
