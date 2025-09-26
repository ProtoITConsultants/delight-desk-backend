import { Injectable } from '@nestjs/common';
import { UserRepository } from './users.repository';
import { CreateUserDto } from './dto/index.dto';

@Injectable()
export class UsersService {
  constructor(private readonly userRepo: UserRepository) {}

  create(createUserDto: CreateUserDto) {
    return this.userRepo.create(createUserDto);
  }

  findOne(id: string) {
    return this.userRepo.findById(id);
  }

  findByEmail(email: string) {
    return this.userRepo.findByEmail(email);
  }

  update(id: string, fields: object) {
    return this.userRepo.update(id, fields);
  }

  remove(id: string) {
    return this.userRepo.delete(id);
  }

  setResetToken(userId: string, token: string, expiry: Date) {
    return this.userRepo.update(userId, {
      passwordResetToken: token,
      passwordResetExpiresAt: expiry,
    });
  }

  findByResetToken(token: string) {
    return this.userRepo.findByResetToken(token);
  }

  updatePassword(userId: string, hashedPassword: string) {
    return this.userRepo.update(userId, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    });
  }
}
