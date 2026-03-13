import { Body, Controller, Post, Session } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, ResetPasswordDto, SignupDto } from './dto/index.dto';
import { SubscriptionService } from '../billing/subscriptions/subscription.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post('signup')
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates a new user account with provided details. Automatically sets up a session cookie ' +
      'upon successful registration and creates a default subscription.',
  })
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered and session created',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Signup successful' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or email already registered',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Email already registered' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  async signup(@Body() dto: SignupDto, @Session() session: Record<string, any>) {
    const { userId } = await this.authService.signup(dto, session);
    await this.subscriptionService.createSubscriptionManual(userId);
    return { message: 'Signup successful' };
  }

  @Post('login')
  @ApiOperation({
    summary: 'Login to existing account',
    description:
      'Authenticates user with email and password. Creates a session cookie upon successful login.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in and session created',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Login successful' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Invalid credentials' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  async login(@Body() dto: LoginDto, @Session() session: Record<string, any>) {
    const { userId } = await this.authService.login(dto, session);
    await this.subscriptionService.createSubscriptionManual(userId);
    return { message: 'Login successful' };
  }

  @Post('logout')
  @ApiOperation({
    summary: 'Logout from current session',
    description: 'Destroys the current session and clears the session cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged out',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Logged out successfully' },
      },
    },
  })
  logout(@Session() session: Record<string, any>) {
    return this.authService.logout(session);
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Sends a password reset email with a token to the provided email address. Token expires in 1 hour.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password reset email sent' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found with provided email',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 404 },
        message: { type: 'string', example: 'User not found' },
        error: { type: 'string', example: 'Not Found' },
      },
    },
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password with token',
    description:
      'Resets user password using the token received via email. Token must be valid and not expired.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password reset successful' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired token',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'Invalid or expired token' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
