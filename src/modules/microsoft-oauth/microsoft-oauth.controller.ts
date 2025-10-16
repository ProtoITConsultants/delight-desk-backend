import { Controller, Delete, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MicrosoftOauthService } from './microsoft-oauth.service';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';

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
}
