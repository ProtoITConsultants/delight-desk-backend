import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { SendgridModule } from '../sendgrid/sendgrid.module';

@Module({
  imports: [UsersModule, SendgridModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
