import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GoogleOauthService } from './google-oauth.service';

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
      return res.redirect(process.env.GOOGLE_SUCCESS_REDIRECT);
    } catch (err) {
      console.error('Google connect failed:', err);
      return res.redirect(process.env.GOOGLE_FAILURE_REDIRECT);
    }
  }

  @Get('disconnect')
  async disconnect(@Req() req, @Res() res) {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).send('Not logged in');
    }

    await this.googleService.disconnectGoogleAccount(userId);

    return res.redirect(process.env.GOOGLE_SUCCESS_REDIRECT);
  }
}
