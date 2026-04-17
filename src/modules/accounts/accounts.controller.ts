import { Body, Controller, Delete, Get, Patch, Session, UseGuards } from '@nestjs/common';

import { AccountsService } from './accounts.service';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { ChangePasswordDto, UpdateProfileDto } from './dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @UseGuards(SessionGuard)
  @Get('profile')
  getProfile(@CurrentUserId() userId: string) {
    return this.accountsService.getProfile(userId);
  }

  @UseGuards(SessionGuard)
  @Patch('profile')
  updateProfile(@CurrentUserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.accountsService.updateProfile(userId, dto);
  }

  @UseGuards(SessionGuard)
  @Patch('change-password')
  changePassword(@CurrentUserId() userId: string, @Body() dto: ChangePasswordDto) {
    return this.accountsService.changePassword(userId, dto);
  }

  @UseGuards(SessionGuard)
  @Delete('delete')
  deleteAccount(@CurrentUserId() userId: string, @Session() session: Record<string, any>) {
    return this.accountsService.deleteAccount(userId, session);
  }
}
