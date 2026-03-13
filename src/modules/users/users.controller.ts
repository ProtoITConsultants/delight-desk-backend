import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { GetUsersDto } from './dto/index.dto';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';

@ApiTags('Users')
@ApiCookieAuth('connect.sid')
@UseGuards(SessionGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('verify-admin')
  @ApiOperation({
    summary: 'Verify admin status',
    description: 'Check if the current user has administrator privileges',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin status returned successfully',
    schema: {
      type: 'object',
      properties: { isAdmin: { type: 'boolean', example: false } },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async verifyAdmin(@CurrentUserId() userId: string) {
    const isAdmin = await this.usersService.verifyAdmin(userId);
    return isAdmin;
  }

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieve the profile information of the currently authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string' },
        role: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async me(@CurrentUserId() userId: string) {
    const me = await this.usersService.me(userId);
    return me;
  }

  @Get()
  @ApiOperation({
    summary: 'Get users list (Admin only)',
    description: 'Retrieve paginated list of all users with their details, OAuth accounts, and store connections. Admin access required.'
  })
  @ApiQuery({ name: 'q', required: false, type: String, description: 'Search query for filtering users' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Users list retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              email: { type: 'string' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              phone: { type: 'string', nullable: true },
              lastLoginAt: { type: 'string', nullable: true },
              oauthAccount: { type: 'object', nullable: true },
              storeConnection: { type: 'object', nullable: true },
              subscriptionPlanName: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUsersForAdminPanel(@Query() query: GetUsersDto, @CurrentUserId() userId: string) {
    const { isAdmin } = await this.usersService.verifyAdmin(userId);
    if (!isAdmin) throw new ForbiddenException();
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const result = await this.usersService.getUsersForAdminPanel(userId, query.q, page, limit);
    return result;
  }

  @Get('connections')
  @ApiOperation({
    summary: 'Get user connections details',
    description: 'Retrieve details of all connected OAuth accounts and store integrations for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Connections details retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        wooCommerce: {
          type: 'object',
          nullable: true,
          properties: { status: { type: 'string' }, storeUrl: { type: 'string' } },
        },
        gmail: {
          type: 'object',
          nullable: true,
          properties: { status: { type: 'string' }, email: { type: 'string' } },
        },
        outlook: {
          type: 'object',
          nullable: true,
          properties: { status: { type: 'string' }, email: { type: 'string' } },
        },
        shipbob: { type: 'object', nullable: true },
        shipstation: { type: 'object', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  getConnectionsDetail(@CurrentUserId() userId: string) {
    return this.usersService.getConnectionsDetail(userId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete user by ID (Admin only)',
    description: 'Delete a user account by their ID. This action requires admin privileges.'
  })
  @ApiParam({ name: 'id', type: String, description: 'User UUID to delete' })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully',
    schema: {
      type: 'object',
      properties: { deleted: { type: 'boolean', example: true } },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid UUID format' })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async deleteUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUserId() sessionUserId: string,
  ) {
    return await this.usersService.deleteUserById(sessionUserId, id);
  }
}
