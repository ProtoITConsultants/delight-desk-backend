import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { SessionGuard } from 'src/guards/session.guard';
import { MicrosoftOauthService } from './microsoft-oauth.service';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { Body, Controller, Delete, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';

@Controller('microsoft-oauth')
export class MicrosoftOauthController {
  constructor(
    private readonly microsoftService: MicrosoftOauthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('login')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftLogin() {}

  @Get('callback')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftCallback(@Req() req: any, @Res() res: any) {
    const userId = req.session?.userId;
    // const userId = '6a9bd2af-76e4-4376-a996-c73cbd0d0d6d';
    const msAccount = req.user;
    const scopes = req.query.scope?.toString().split(' ') || [];

    if (!userId) {
      return res
        .status(401)
        .send('You must be logged in to delight desk before connecting Microsoft');
    }

    const MICROSOFT_SUCCESS_REDIRECT = this.configService.get('MICROSOFT_SUCCESS_REDIRECT');
    const MICROSOFT_FAILURE_REDIRECT = this.configService.get('MICROSOFT_FAILURE_REDIRECT');

    try {
      await this.microsoftService.connectMicrosoftAccount(userId, msAccount, scopes);
      // await this.microsoftService.createMailSubscription(userId);
      return res.redirect(MICROSOFT_SUCCESS_REDIRECT);
    } catch (err) {
      return res.redirect(MICROSOFT_FAILURE_REDIRECT);
    }
  }

  @Delete('disconnect')
  @UseGuards(SessionGuard)
  async disconnect(@CurrentUserId() userId: string) {
    await this.microsoftService.disconnectMicrosoftAccount(userId);
    return { message: 'Account disconnected successfully' };
  }

  @Get('outlook/webhook')
  async validateWebhook(@Query('validationToken') validationToken: string, @Res() res) {
    if (validationToken) {
      return res.setHeader('Content-Type', 'text/plain').status(200).send(validationToken);
    }

    return res.status(400).send('Missing validation token');
  }

  @Post('outlook/webhook')
  async receiveNotifications(@Body() body: any) {
    // await this.microsoftService.processNotifications(body);
    return { received: true };
  }
}
