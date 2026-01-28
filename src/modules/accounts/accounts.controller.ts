import { Body, Controller, Delete, Get, Patch, Session, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiBody } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { ChangePasswordDto, UpdateProfileDto } from './dto';

@ApiTags('Accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @UseGuards(SessionGuard)
  @Get('profile')
  @ApiOperation({
    summary: 'Get user profile',
    description: 'Retrieve the current user account profile information'
  })
  @ApiCookieAuth('connect.sid')
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'User profile not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getProfile(@CurrentUserId() userId: string) {
    return this.accountsService.getProfile(userId);
  }

  @UseGuards(SessionGuard)
  @Patch('profile')
  @ApiOperation({
    summary: 'Update user profile',
    description: 'Update user profile information such as name, company, and phone'
  })
  @ApiCookieAuth('connect.sid')
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  updateProfile(@CurrentUserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.accountsService.updateProfile(userId, dto);
  }

  @UseGuards(SessionGuard)
  @Patch('change-password')
  @ApiOperation({
    summary: 'Change password',
    description: 'Change the current user password by providing current password and new password'
  })
  @ApiCookieAuth('connect.sid')
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid password or passwords do not match' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated or current password incorrect' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  changePassword(@CurrentUserId() userId: string, @Body() dto: ChangePasswordDto) {
    return this.accountsService.changePassword(userId, dto);
  }

  @UseGuards(SessionGuard)
  @Delete('delete')
  @ApiOperation({
    summary: 'Delete account',
    description: 'Permanently delete the current user account and all associated data'
  })
  @ApiCookieAuth('connect.sid')
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  deleteAccount(@CurrentUserId() userId: string, @Session() session: Record<string, any>) {
    return this.accountsService.deleteAccount(userId, session);
  }
}
