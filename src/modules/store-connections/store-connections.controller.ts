import { Controller, Get, Post, Body, Patch, Param, Delete, Req, BadRequestException } from '@nestjs/common';
import { StoreConnectionsService } from './store-connections.service';
import { CreateStoreConnectionDto } from './dto/create-store-connection.dto';
import { UpdateStoreConnectionDto } from './dto/update-store-connection.dto';

@Controller('store-connections')
export class StoreConnectionsController {
  constructor(private readonly service: StoreConnectionsService) {}

  @Post()
  create(@Body() data: CreateStoreConnectionDto, @Req() req: any) {
  // Try to get userId from session, cookies, or req.user
  const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
  if (!userId) {
    throw new BadRequestException('User not logged in');
  }
  data.userid = String(userId); // override from cookie/session
  return this.service.create(data);
  }

  @Get()
  findAll(@Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.service.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: number, @Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.service.findOne(String(id), userId);
  }

  @Patch(':id')
  update(@Param('id') id: number, @Body() data: UpdateStoreConnectionDto, @Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.service.update(String(id), userId, data);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Req() req: any) {
    const userId = req?.cookies?.userId || req?.session?.userId || req?.user?.userId;
    if (!userId) {
      throw new BadRequestException('User not logged in');
    }
    return this.service.remove(String(id), userId);
  }
}
