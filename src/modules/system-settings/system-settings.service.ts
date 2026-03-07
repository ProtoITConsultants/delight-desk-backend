import { BadRequestException, Injectable } from '@nestjs/common';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { ShipBobService } from '../shipbob/shipbob.service';
import { ShipStationService } from '../shipstation/shipstation.service';
import { FulfillmentMethod, SetFulfillmentMethodDto } from './dto';
import { FulfillmentMethodResponse, SetFulfillmentMethodResponse } from './system-settings.types';

@Injectable()
export class SystemSettingsService {
  constructor(
    private readonly systemSettingsRepository: SystemSettingsRepository,
    private readonly shipBobService: ShipBobService,
    private readonly shipStationService: ShipStationService,
  ) {}

  async getFulfillmentMethod(userId: string): Promise<FulfillmentMethodResponse> {
    const settings = await this.systemSettingsRepository.findByUser(userId);
    const rawMethod = settings?.fulfillmentMethod;
    const method: FulfillmentMethod = Object.values(FulfillmentMethod).includes(
      rawMethod as FulfillmentMethod,
    )
      ? (rawMethod as FulfillmentMethod)
      : FulfillmentMethod.SELF;

    return {
      method,
      warehouseEmail: settings?.warehouseEmail ?? null,
      shipbobPersonalAccessToken: settings?.shipbobPersonalAccessToken ? '••••••••' : null,
      shipstationApiKey: settings?.shipstationApiKey ? '••••••••' : null,
    };
  }

  async setFulfillmentMethod(
    userId: string,
    dto: SetFulfillmentMethodDto,
  ): Promise<SetFulfillmentMethodResponse> {
    switch (dto.method) {
      case FulfillmentMethod.SELF:
        await this.systemSettingsRepository.upsert(userId, {
          fulfillmentMethod: dto.method,
          warehouseEmail: null,
          shipbobPersonalAccessToken: null,
          shipbobChannelId: null,
          shipstationApiKey: null,
        });
        break;

      case FulfillmentMethod.CUSTOM_WAREHOUSE:
        if (!dto.warehouseEmail) {
          throw new BadRequestException('warehouseEmail is required for custom_warehouse');
        }
        await this.systemSettingsRepository.upsert(userId, {
          fulfillmentMethod: dto.method,
          warehouseEmail: dto.warehouseEmail,
          shipbobPersonalAccessToken: null,
          shipbobChannelId: null,
          shipstationApiKey: null,
        });
        break;

      case FulfillmentMethod.SHIPBOB:
        if (!dto.shipbobPersonalAccessToken) {
          throw new BadRequestException('shipbobPersonalAccessToken is required for shipbob');
        }
        const { channelId: shipbobChannelId } = await this.shipBobService.verifyCredentials(
          dto.shipbobPersonalAccessToken,
        );
        await this.systemSettingsRepository.upsert(userId, {
          fulfillmentMethod: dto.method,
          warehouseEmail: null,
          shipbobPersonalAccessToken: dto.shipbobPersonalAccessToken,
          shipbobChannelId,
          shipstationApiKey: null,
        });
        break;

      case FulfillmentMethod.SHIPSTATION:
        if (!dto.shipstationApiKey) {
          throw new BadRequestException('shipstationApiKey is required for shipstation');
        }
        await this.shipStationService.verifyCredentials(dto.shipstationApiKey);
        await this.systemSettingsRepository.upsert(userId, {
          fulfillmentMethod: dto.method,
          warehouseEmail: null,
          shipbobPersonalAccessToken: null,
          shipbobChannelId: null,
          shipstationApiKey: dto.shipstationApiKey,
        });
        break;
    }

    return { message: 'Fulfillment method updated successfully' };
  }
}
