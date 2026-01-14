import { Body, Controller, Post, Session } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, ResetPasswordDto, SignupDto } from './dto/index.dto';
import { SubscriptionService } from '../billing/subscriptions/subscription.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto, @Session() session: Record<string, any>) {
    const { userId } = await this.authService.signup(dto, session);
    await this.subscriptionService.createSubscriptionManual(userId);
    return { message: 'Signup successful' };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Session() session: Record<string, any>) {
    const { userId } = await this.authService.login(dto, session);
    await this.subscriptionService.createSubscriptionManual(userId);
    return { message: 'Login successful' };
  }

  @Post('logout')
  logout(@Session() session: Record<string, any>) {
    return this.authService.logout(session);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
