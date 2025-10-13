import { Controller, Delete, Get, NotFoundException, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MicrosoftOauthService } from './microsoft-oauth.service';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';

@Controller('microsoft-oauth')
export class MicrosoftOauthController {
  constructor(private readonly microsoftService: MicrosoftOauthService) {}

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

    try {
      await this.microsoftService.connectMicrosoftAccount(userId, msAccount, scopes);
      const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
      return res.redirect(`${origin}/connections`);
    } catch (err) {
      console.error({ err });
      const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
      return res.redirect(`${origin}/login`);
    }
  }

  @Delete('disconnect')
  @UseGuards(SessionGuard)
  async disconnect(@CurrentUserId() userId: string) {
    await this.microsoftService.disconnectMicrosoftAccount(userId);
    return { message: 'Account disconnected successfully' };
  }
}
