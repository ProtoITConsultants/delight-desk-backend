import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { UsersService } from 'src/modules/users/users.service';
import { SignupDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto/index.dto';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { SendgridService } from '../sendgrid/sendgrid.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sendgridService: SendgridService,
    private readonly configService: ConfigService,
  ) {}

  async signup(dto: SignupDto, session: Record<string, any>) {
    const existing = await this.usersService.findByEmail(dto.email);

    if (existing) throw new BadRequestException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.usersService.create({
      ...dto,
      password: hashed,
    });

    session.userId = user.id;

    return { message: 'Signup successful' };
  }

  async login(dto: LoginDto, session: Record<string, any>) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const match = await bcrypt.compare(dto.password, user.password);

    if (!match) throw new UnauthorizedException('Invalid credentials');

    session.userId = user.id;

    return { message: 'Login successful' };
  }

  async logout(session: Record<string, any>) {
    session.destroy((err: any) => {
      if (err) throw new BadRequestException('Logout failed');
    });

    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = randomUUID();

    const expiryMs = Number(this.configService.get<string>('PASSWORD_RESET_EXPIRY_MS'));

    const expiry = new Date(Date.now() + expiryMs);

    await this.usersService.setResetToken(user.id, token, expiry);

    await this.sendgridService.sendPasswordResetEmail(user.email, token);

    return { message: 'Password reset email sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.usersService.findByResetToken(dto.token);

    if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired token');
    }

    const hashed = await bcrypt.hash(dto.password, 10);

    await this.usersService.updatePassword(user.id, hashed);

    return { message: 'Password reset successful' };
  }
}
