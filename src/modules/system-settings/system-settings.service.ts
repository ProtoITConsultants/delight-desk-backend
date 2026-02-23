import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { SystemSettingsRepository } from 'src/database/repos/system-settings.repository';
import { FulfillmentMethod, SetFulfillmentMethodDto } from './dto';

@Injectable()
export class SystemSettingsService {
  constructor(private readonly systemSettingsRepository: SystemSettingsRepository) {}

  async getFulfillmentMethod(userId: string) {
    const settings = await this.systemSettingsRepository.findByUser(userId);

    return {
      method: settings?.fulfillmentMethod ?? 'self',
      warehouseEmail: settings?.warehouseEmail ?? null,
      shipbobPersonalAccessToken: settings?.shipbobPersonalAccessToken ? '••••••••' : null,
      shipbobChannelId: settings?.shipbobChannelId ?? null,
      shipstationApiKey: settings?.shipstationApiKey ? '••••••••' : null,
    };
  }

  async setFulfillmentMethod(userId: string, dto: SetFulfillmentMethodDto) {
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
        // TODO: Implement proper verification later on
        // await this.verifyShipBobCredentials(dto.shipbobPersonalAccessToken, dto.shipbobChannelId);
        await this.systemSettingsRepository.upsert(userId, {
          fulfillmentMethod: dto.method,
          warehouseEmail: null,
          shipbobPersonalAccessToken: dto.shipbobPersonalAccessToken,
          shipbobChannelId: null, // TODO: Get channel id using pat and store in system settings
          shipstationApiKey: null,
        });
        break;

      case FulfillmentMethod.SHIPSTATION:
        if (!dto.shipstationApiKey) {
          throw new BadRequestException('shipstationApiKey is required for shipstation');
        }
        // TODO: Implement proper verification later on
        // await this.verifyShipStationCredentials(dto.shipstationApiKey);
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

  private async verifyShipBobCredentials(apiKey: string, channelId: string) {
    try {
      await axios.get('https://api.shipbob.com/2025-07/channel', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          shipbob_channel_id: channelId,
        },
      });
    } catch (error: any) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        throw new BadRequestException('Invalid ShipBob API key or channel ID');
      }
      throw new BadRequestException('Invalid ShipBob API key or channel ID');
    }
  }

  private async verifyShipStationCredentials(apiKey: string) {
    try {
      await axios.get('https://ssapi.shipstation.com/accounts', {
        headers: {
          Authorization: `SS ${apiKey}:`,
        },
      });
    } catch (error: any) {
      if (error?.response?.status === 401) {
        throw new BadRequestException('Invalid ShipStation API key');
      }
      throw new BadRequestException('Invalid ShipStation API key');
    }
  }
}
