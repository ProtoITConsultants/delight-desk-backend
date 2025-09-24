import { Injectable } from '@nestjs/common';
import { UserRepository } from './users.repository';
import { CreateUserDto } from './dto/index.dto';

@Injectable()
export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  async create(createUserDto: CreateUserDto) {
    const existing = await this.findByEmail(createUserDto.email);
    if (existing) {
      throw new Error('User already exists');
    }

    const user = await this.userRepo.create(createUserDto);

    return user;
  }

  async findAll() {
    return this.userRepo.findAll();
  }

  async findOne(id: string) {
    return this.userRepo.findById(id);
  }

  async findByEmail(email: string) {
    return await this.userRepo.findByEmail(email);
  }

  async update(id: string, updateUserDto: Partial<{ email: string; name: string }>) {
    return this.userRepo.update(id, updateUserDto);
  }

  async remove(id: string) {
    return this.userRepo.delete(id);
  }

  async setResetToken(userId: string, token: string, expiry: Date) {
    return this.userRepo.update(userId, {
      passwordResetToken: token,
      passwordResetExpiresAt: expiry,
    });
  }

  async findByResetToken(token: string) {
    return this.userRepo.findByResetToken(token);
  }

  async updatePassword(userId: string, hashedPassword: string) {
    return this.userRepo.update(userId, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    });
  }
}
