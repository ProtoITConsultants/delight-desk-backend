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
  Logger,
  Post,
  Redirect,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

@Controller('google-oauth')
export class GoogleOauthController {
  private readonly logger = new Logger(GoogleOauthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly googleService: GoogleOauthService,
  ) {}

  @Get('login')
  @Redirect()
  @UseGuards(SessionGuard)
  async googleLogin(@CurrentUserId() userId: string) {
    const existingAccount = await this.googleService.accountExists(userId);

    if (existingAccount && existingAccount.status === 'connected') {
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
  async googleCallback(@CurrentUserId() userId: string, @Req() req: any, @Res() res: any) {
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
    const GOOGLE_FAILURE_LOCAL_REDIRECT =
      this.configService.get('GOOGLE_FAILURE_LOCAL_REDIRECT') || GOOGLE_SUCCESS_LOCAL_REDIRECT;
    const GOOGLE_FAILURE_STAGING_REDIRECT =
      this.configService.get('GOOGLE_FAILURE_STAGING_REDIRECT') || GOOGLE_SUCCESS_STAGING_REDIRECT;
    const seeOtherStatusCode = 303;

    try {
      await this.googleService.connectGoogleAccount(userId, googleAccount, scopes);
      await this.googleService.watchGmail(userId);

      return isRequestFromLocal
        ? res.redirect(GOOGLE_SUCCESS_LOCAL_REDIRECT)
        : res.redirect(GOOGLE_SUCCESS_STAGING_REDIRECT);
    } catch (err: any) {
      // Surface the real error in logs/Sentry — previously this was silently swallowed
      // and the user was redirected to the SUCCESS URL on failure, which masked bugs
      // like the unique-email constraint rejecting the INSERT when the same Gmail
      // mailbox was already linked to another Delight Desk account.
      this.logger.error({
        event: 'google_oauth_callback_failed',
        userId,
        email: googleAccount?.email,
        error: err?.message || 'Unknown error',
        stack: err?.stack,
      });

      return isRequestFromLocal
        ? res.redirect(seeOtherStatusCode, GOOGLE_FAILURE_LOCAL_REDIRECT)
        : res.redirect(seeOtherStatusCode, GOOGLE_FAILURE_STAGING_REDIRECT);
    }
  }

  @Delete('disconnect')
  @UseGuards(SessionGuard)
  async disconnect(@CurrentUserId() userId: string) {
    await this.googleService.disconnectGoogleAccount(userId);
    return { message: 'Google account disconnected successfully' };
  }

  @Post('gmail/webhook')
  @HttpCode(200)
  handleGmailWebhook(@Body() body: any) {
    const message = body?.message?.data;
    if (!message) return;

    const decoded = JSON.parse(Buffer.from(message, 'base64').toString('utf-8'));
    const userEmail = decoded.emailAddress;
    const historyId = decoded.historyId;

    console.log(`Webhook received for ${userEmail}, historyId: ${historyId}`);

    this.googleService.processNewEmails(userEmail, historyId).catch((error) => {
      console.error('Error handling webhook:', error);
    });
  }
}
