// app/api/watch-ship/[id]/route.ts
import { NextResponse } from 'next/server';
import { ShippingTrackingRecord } from '@/types/shipping';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const trackingId = params.id;

  // TODO: Future Supabase implementation for the 6:20 PM sprint:
  // const { data, error } = await supabase.from('shipping_tracking').select('*').eq('id', trackingId).single();

  // Temporary Mock State matching our unified types layout
  const mockTrackingData: ShippingTrackingRecord = {
    id: trackingId,
    order_id: "order_uuid_12345",
    tracking_number: "1Z999AA10123456784",
    carrier: "UPS",
    current_status: "IN_TRANSIT",
    estimated_delivery: "2026-06-25T18:00:00Z",
    status_history: [
      {
        timestamp: "2026-06-22T09:30:00Z",
        location: "Secaucus, NJ",
        description: "Origin Scan - High Value Asset Verification Cleared",
        status: "IN_TRANSIT"
      },
      {
        timestamp: "2026-06-22T08:00:00Z",
        location: "Secaucus, NJ",
        description: "Label Created / Shipment Data Received",
        status: "LABEL_CREATED"
      }
    ],
    updated_at: new Date().toISOString()
  };

  return NextResponse.json(mockTrackingData);
}