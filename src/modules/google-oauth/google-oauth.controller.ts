import { Controller, Delete, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GoogleOauthService } from './google-oauth.service';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import express from 'express';

@Controller('google-oauth')
export class GoogleOauthController {
  constructor(
    private readonly googleService: GoogleOauthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('login')
  @UseGuards(AuthGuard('google'))
  async googleLogin() {}

  @Get('callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: express.Response) {
    const userId = req.session?.userId;
    const googleAccount = req.user;
    const scopes = req.query.scope?.toString().split(' ') || [];

    if (!userId) {
      return res.status(401).send('You must be logged in to delight desk before connecting Google');
    }

    const origin: string = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const isRequestFromLocal = origin.includes('localhost');
    const GOOGLE_SUCCESS_LOCAL_REDIRECT = this.configService.get('GOOGLE_SUCCESS_LOCAL_REDIRECT');
    const GOOGLE_SUCCESS_STAGING_REDIRECT = this.configService.get(
      'GOOGLE_SUCCESS_STAGING_REDIRECT',
    );
    const seeOtherStatusCode = 303;

    try {
      await this.googleService.connectGoogleAccount(userId, googleAccount, scopes);

      return isRequestFromLocal
        ? res.redirect(GOOGLE_SUCCESS_LOCAL_REDIRECT)
        : res.redirect(GOOGLE_SUCCESS_STAGING_REDIRECT);
    } catch (err) {
      return isRequestFromLocal
        ? res.redirect(seeOtherStatusCode, GOOGLE_SUCCESS_LOCAL_REDIRECT)
        : res.redirect(seeOtherStatusCode, GOOGLE_SUCCESS_STAGING_REDIRECT);
    }
  }

  @Delete('disconnect')
  @UseGuards(SessionGuard)
  async disconnect(@CurrentUserId() userId: string) {
    await this.googleService.disconnectGoogleAccount(userId);
    return { message: 'Account disconnected successfully' };
  }
}
