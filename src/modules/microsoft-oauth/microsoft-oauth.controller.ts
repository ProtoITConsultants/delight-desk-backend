import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { SessionGuard } from 'src/guards/session.guard';
import { MicrosoftOauthService } from './microsoft-oauth.service';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

@Controller('microsoft-oauth')
export class MicrosoftOauthController {
  constructor(
    private readonly configService: ConfigService,
    private readonly microsoftService: MicrosoftOauthService,
  ) {}

  @Get('login')
  @UseGuards(SessionGuard)
  async microsoftLogin(@Req() req: any) {
    const userId = req.session.userId;
    const existingAccount = await this.microsoftService.accountExists(userId);
    if (existingAccount) {
      throw new BadRequestException('An account already connected');
    }

    return {
      url: '/google-oauth/redirect',
      statusCode: HttpStatus.FOUND,
    };
  }

  @Get('redirect')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftRedirect() {}

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
