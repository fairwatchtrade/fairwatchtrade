// types/shipping.ts

export type CarrierName = 'FedEx' | 'UPS' | 'USPS' | 'DHL' | 'Other';

export type TrackingStatus = 
  | 'LABEL_CREATED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'EXCEPTION'
  | 'HOLD';

export interface TrackingMilestone {
  timestamp: string;      // ISO 8601 string from carrier callback
  location: string;       // e.g., "Memphis, TN" or "Secaucus, NJ"
  description: string;    // e.g., "Left sorting facility" or "Import scan"
  status: TrackingStatus;
}

export interface ShippingTrackingRecord {
  id: string;               // UUID Primary Key
  order_id: string;         // References the transaction/listing UUID
  tracking_number: string;  // Raw tracking string from seller
  carrier: CarrierName;
  current_status: TrackingStatus;
  estimated_delivery: string | null; // ISO 8601 string
  status_history: TrackingMilestone[]; // JSONB data array for the timeline
  updated_at: string;       // Timestamp of last carrier scan
}