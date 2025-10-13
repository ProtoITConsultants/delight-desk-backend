import { Controller, Delete, Get, NotFoundException, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GoogleOauthService } from './google-oauth.service';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';

@Controller('google-oauth')
export class GoogleOauthController {
  constructor(private readonly googleService: GoogleOauthService) {}

  @Get('login')
  @UseGuards(AuthGuard('google'))
  async googleLogin() {}

  @Get('callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: any) {
    const userId = req.session?.userId;
    const googleAccount = req.user;
    const scopes = req.query.scope?.toString().split(' ') || [];

    if (!userId) {
      return res.status(401).send('You must be logged in to delight desk before connecting Google');
    }

    try {
      await this.googleService.connectGoogleAccount(userId, googleAccount, scopes);
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
    await this.googleService.disconnectGoogleAccount(userId);
    return { message: 'Account disconnected successfully' };
  }
}
