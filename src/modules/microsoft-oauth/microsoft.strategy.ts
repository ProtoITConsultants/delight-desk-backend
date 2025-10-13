import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Strategy } from 'passport-microsoft';
import { Request } from 'express';

export interface MicrosoftProfile {
  id: string;
  displayName: string;
  name?: {
    familyName?: string;
    givenName?: string;
  };
  emails?: Array<{ value: string; type?: string }>;
  _json: {
    id: string;
    displayName: string;
    mail?: string;
    userPrincipalName?: string;
    givenName?: string;
    surname?: string;
  };
}

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor() {
    super({
      clientID: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      callbackURL: process.env.MICROSOFT_CALLBACK_URL!,
      tenant: process.env.MICROSOFT_TENANT_ID || 'common',
      scope: process.env.MICROSOFT_SCOPES
        ? process.env.MICROSOFT_SCOPES.split(',').map((s) => s.trim())
        : ['openid', 'profile', 'email', 'offline_access'],
      passReqToCallback: true,
    });
  }

  authorizationParams(): any {
    return {
      prompt: 'consent',
    };
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string | undefined,
    profile: MicrosoftProfile,
    done: any,
  ): Promise<any> {
    const { id, displayName, emails } = profile;
    const email = emails?.[0]?.value || profile._json.mail || profile._json.userPrincipalName;

    if (!email) {
      return done(new UnauthorizedException('Email not provided by Microsoft'), null);
    }

    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const microsoftAccount = {
      provider: 'microsoft',
      providerUserId: id,
      email,
      displayName,
      avatarUrl: undefined,
      accessToken,
      refreshToken: refreshToken || null,
      expiresAt,
    };

    done(null, microsoftAccount);
  }
}
