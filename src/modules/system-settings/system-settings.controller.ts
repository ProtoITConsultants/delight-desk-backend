import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { SessionGuard } from 'src/guards/session.guard';
import { SetFulfillmentMethodDto } from './dto';
import { SystemSettingsService } from './system-settings.service';
import { FulfillmentMethodResponse, SetFulfillmentMethodResponse } from './system-settings.types';

@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @UseGuards(SessionGuard)
  @Get('fulfillment-method')
  getFulfillmentMethod(@CurrentUserId() userId: string): Promise<FulfillmentMethodResponse> {
    return this.systemSettingsService.getFulfillmentMethod(userId);
  }

  @UseGuards(SessionGuard)
  @Patch('fulfillment-method')
  setFulfillmentMethod(
    @CurrentUserId() userId: string,
    @Body() dto: SetFulfillmentMethodDto,
  ): Promise<SetFulfillmentMethodResponse> {
    return this.systemSettingsService.setFulfillmentMethod(userId, dto);
  }
}
