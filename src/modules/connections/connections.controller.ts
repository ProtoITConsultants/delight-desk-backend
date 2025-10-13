import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConnectionsService } from './connections.service';
import { SessionGuard } from 'src/guards/session.guard';
import { CurrentUserId } from 'src/decorators/current-user.decorator';

@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @UseGuards(SessionGuard)
  @Get()
  getConnectionsDetail(@CurrentUserId() userId: string) {
    return this.connectionsService.getConnectionsDetail(userId);
  }
}
