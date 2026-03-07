export enum ShipBobOrderStatus {
  NONE = 'None',
  PROCESSING = 'Processing',
  COMPLETED = 'Completed',
  EXCEPTION = 'Exception',
  ON_HOLD = 'OnHold',
  CANCELLED = 'Cancelled',
  CLEAN_SWEEPED = 'CleanSweeped',
  LABEL_CREATED = 'LabeledCreated',
  IMPORT_REVIEW = 'ImportReview',
}

export enum ShipBobCancellationStatus {
  SUCCESS = 'Success',
  FAILURE = 'Failure',
  PARTIAL_SUCCESS = 'PartialSuccess',
}

export type ShipBobShipment = {
  status?: string;
};

export type ShipBobOrder = {
  id: number;
  status?: string;
  order_number?: string;
  shipments?: ShipBobShipment[];
};

export type ShipBobCanceledShipmentResult = {
  is_success?: boolean;
};

export type ShipBobCancelOrderResponse = {
  status?: string;
  canceled_shipment_results?: ShipBobCanceledShipmentResult[];
};

export type ShipBobOrderListResponse = {
  items?: ShipBobOrder[];
};

export type ShipBobChannelsResponse = {
  items?: Array<{ id?: number | string; scopes?: unknown[] }>;
};
