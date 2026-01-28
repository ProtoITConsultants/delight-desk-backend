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
import {
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('Google OAuth')
@Controller('google-oauth')
export class GoogleOauthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly googleService: GoogleOauthService,
  ) {}

  @Get('login')
  @ApiOperation({
    summary: 'Initiate Google OAuth login',
    description: 'Start the Google OAuth flow to connect a Google account',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth' })
  @ApiResponse({ status: 400, description: 'Bad request - Account already connected' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @Redirect()
  @UseGuards(SessionGuard)
  async googleLogin(@Req() req: any) {
    const userId = req.session.userId;
    // const userId = '9d1ec857-9115-427b-95ed-e84afe4b3577';
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
  @ApiExcludeEndpoint()
  @UseGuards(AuthGuard('google'))
  async googleRedirect() {}

  @Get('callback')
  @ApiExcludeEndpoint()
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: any) {
    const userId = req.session?.userId;
    // const userId = '9d1ec857-9115-427b-95ed-e84afe4b3577';
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
  @ApiOperation({
    summary: 'Disconnect Google account',
    description: 'Disconnect the linked Google account from the user profile',
  })
  @ApiCookieAuth('connect.sid')
  @ApiResponse({ status: 200, description: 'Account disconnected successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'Google account not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  @UseGuards(SessionGuard)
  async disconnect(@CurrentUserId() userId: string) {
    await this.googleService.disconnectGoogleAccount(userId);
    return { message: 'Account disconnected successfully' };
  }

  @Post('gmail/webhook')
  @ApiExcludeEndpoint()
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
