import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { SessionGuard } from 'src/guards/session.guard';
import { GoogleOauthService } from './google-oauth.service';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Redirect,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

@Controller('google-oauth')
export class GoogleOauthController {
  constructor(
    private readonly googleService: GoogleOauthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('login')
  @Redirect()
  @UseGuards(SessionGuard)
  async googleLogin(@Req() req: any) {
    const userId = req.session.userId;
    const existingAccount = await this.googleService.accountExists(userId);
    if (existingAccount) {
      throw new BadRequestException('An account already connected');
    }

    return {
      url: '/google-oauth/redirect',
      statusCode: HttpStatus.FOUND,
    };
  }

  @Get('redirect')
  @UseGuards(AuthGuard('google'))
  async googleRedirect() {}

  @Get('callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: any) {
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
      await this.googleService.watchGmail(userId);

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

  @Post('gmail/webhook')
  @HttpCode(200)
  handleGmailWebhook(@Body() body: any) {
    const message = body?.message?.data;
    if (!message) return;
    const decoded = JSON.parse(Buffer.from(message, 'base64').toString('utf-8'));
    const userEmail = decoded.emailAddress;
    const historyId = decoded.historyId;
    // this.googleService.processNewEmails(userEmail, historyId);
  }
}
