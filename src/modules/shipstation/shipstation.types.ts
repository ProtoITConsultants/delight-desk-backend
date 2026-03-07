export enum ShipStationShipmentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  LABEL_PURCHASED = 'label_purchased',
  CANCELLED = 'cancelled',
}

export type ShipStationShipment = {
  shipment_id: string;
  shipment_number?: string | null;
  external_shipment_id?: string | null;
  external_order_id?: string | null;
  shipment_status?: ShipStationShipmentStatus;
};

export type ShipStationShipmentsResponse = {
  shipments?: ShipStationShipment[];
};

export type ShipStationLabel = {
  label_id: string;
  shipment_id?: string;
  voided?: boolean;
};

export type ShipStationLabelsResponse = {
  labels?: ShipStationLabel[];
};

export type ShipStationVoidLabelResponse = {
  approved: boolean;
  message: string;
  reason_code?: string;
};
