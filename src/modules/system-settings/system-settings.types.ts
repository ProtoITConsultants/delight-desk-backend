import { FulfillmentMethod } from './dto';

export type FulfillmentMethodResponse = {
  method: FulfillmentMethod;
  warehouseEmail: string | null;
  shipbobPersonalAccessToken: string | null;
  shipstationApiKey: string | null;
};

export type SetFulfillmentMethodResponse = {
  message: string;
};
