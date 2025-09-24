import { Body, Controller, Post, Session } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupDto, ForgotPasswordDto, LoginDto, ResetPasswordDto } from './dto/index.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Session() session: Record<string, any>) {
    return this.authService.login(dto, session);
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
