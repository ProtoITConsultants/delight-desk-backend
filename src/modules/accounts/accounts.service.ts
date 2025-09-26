import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { plainToInstance } from 'class-transformer';
import { UserResponseDto } from '../users/dto/index.dto';
import { ChangePasswordDto, UpdateProfileDto } from './dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AccountsService {
  constructor(private readonly usersService: UsersService) {}

  async getProfile(userId: string) {
    const user = await this.usersService.findOne(userId);
    const userInstance = plainToInstance(UserResponseDto, user);
    return {
      user: userInstance,
      billing: null,
      plan: null,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const updatedUser = await this.usersService.update(userId, dto);
    const userInstance = plainToInstance(UserResponseDto, updatedUser);
    return {
      user: userInstance,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersService.findOne(userId);

    if (!user) throw new BadRequestException('User not found');

    const passwordMatches = await bcrypt.compare(dto.currentPassword, user.password);

    if (!passwordMatches) {
      throw new BadRequestException('Current password is incorrect');
    }

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('New password and confirm password do not match');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePassword(userId, hashed);

    return { message: 'Password changed successfully' };
  }

  async deleteAccount(userId: string, session: Record<string, any>) {
    const user = await this.usersService.findOne(userId);

    if (!user) throw new BadRequestException('User not found');

    await this.usersService.remove(userId);

    session.destroy((err: any) => {
      if (err) throw new BadRequestException('Session deletion failed');
    });

    return { message: 'Account deleted successfully' };
  }
}
