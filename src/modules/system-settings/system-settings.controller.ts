import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUserId } from 'src/decorators/current-user.decorator';
import { SessionGuard } from 'src/guards/session.guard';
import { SetFulfillmentMethodDto } from './dto';
import { SystemSettingsService } from './system-settings.service';
import { FulfillmentMethodResponse, SetFulfillmentMethodResponse } from './system-settings.types';

@ApiTags('System Settings')
@Controller('system-settings')
export class SystemSettingsController {
  constructor(private readonly systemSettingsService: SystemSettingsService) {}

  @UseGuards(SessionGuard)
  @Get('fulfillment-method')
  @ApiOperation({
    summary: 'Get fulfillment method',
    description: 'Retrieve the current fulfillment method and its configuration',
  })
  @ApiCookieAuth('connect.sid')
  @ApiResponse({
    status: 200,
    description: 'Fulfillment method retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['self', 'custom_warehouse', 'shipbob', 'shipstation'] },
        warehouseEmail: { type: 'string', nullable: true },
        shipbobPersonalAccessToken: { type: 'string', nullable: true },
        shipstationApiKey: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  getFulfillmentMethod(@CurrentUserId() userId: string): Promise<FulfillmentMethodResponse> {
    return this.systemSettingsService.getFulfillmentMethod(userId);
  }

  @UseGuards(SessionGuard)
  @Patch('fulfillment-method')
  @ApiOperation({
    summary: 'Set fulfillment method',
    description: 'Configure the preferred fulfillment method and associated credentials',
  })
  @ApiCookieAuth('connect.sid')
  @ApiBody({ type: SetFulfillmentMethodDto })
  @ApiResponse({
    status: 200,
    description: 'Fulfillment method updated successfully',
    schema: {
      type: 'object',
      properties: { message: { type: 'string' } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid credentials or missing required fields',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - User not authenticated' })
  setFulfillmentMethod(
    @CurrentUserId() userId: string,
    @Body() dto: SetFulfillmentMethodDto,
  ): Promise<SetFulfillmentMethodResponse> {
    return this.systemSettingsService.setFulfillmentMethod(userId, dto);
  }
}
