import {
  Controller,
  Get,
  Query,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { GetUsersDto } from './dto/index.dto';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';

@UseGuards(SessionGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('verify-admin')
  async verifyAdmin(@CurrentUserId() userId: string) {
    const isAdmin = await this.usersService.verifyAdmin(userId);
    return isAdmin;
  }

  @Get('me')
  async me(@CurrentUserId() userId: string) {
    const me = await this.usersService.me(userId);
    return me;
  }

  @Get()
  async getUsersForAdminPanel(@Query() query: GetUsersDto, @CurrentUserId() userId: string) {
    const { isAdmin } = await this.usersService.verifyAdmin(userId);
    if (!isAdmin) throw new ForbiddenException();
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const result = await this.usersService.getUsersForAdminPanel(userId, query.q, page, limit);
    return result;
  }

  @Get('connections')
  getConnectionsDetail(@CurrentUserId() userId: string) {
    return this.usersService.getConnectionsDetail(userId);
  }

  @Delete(':id')
  async deleteUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUserId() sessionUserId: string,
  ) {
    return await this.usersService.deleteUserById(sessionUserId, id);
  }
}
