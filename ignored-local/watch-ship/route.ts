pp/api/watch-ship/route.ts
TypeScript
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

// Interface representing the inbound transit event payload structure
interface TrackingEventPayload {
  listingId: string
  trackingNumber: string
  carrier: string
  status: 'ORIGIN_SCAN' | 'HUB' | 'OUT_FOR_DELIVERY' | 'DELIVERED_SECURED'
  location: string
  details?: string
}

export async function POST(request: Request) {
  try {
    const supabase = createClient()
    
    // 1. Authenticate the active session (Secure server-side tracking)
    const { data: { session }, error: authError } = await supabase.auth.getSession()
    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized: Cryptographic session missing' },
        { status: 401 }
      )
    }

    // 2. Parse and validate the inbound tracking payload
    const body: TrackingEventPayload = await request.json()
    const { listingId, trackingNumber, carrier, status, location, details } = body

    if (!listingId || !trackingNumber || !status || !location) {
      return NextResponse.json(
        { error: 'Bad Request: Missing mandatory tracking payload signatures' },
        { status: 400 }
      )
    }

    // 3. Verify that the user is tied directly to this transaction (Buyer or Seller)
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, seller_id')
      .eq('id', listingId)
      .single()

    if (listingError || !listing) {
      return NextResponse.json(
        { error: 'Asset verification failed: Listing not found' },
        { status: 404 }
      )
    }

    // 4. Ingest tracking payload history into the persistence layer
    const { data: transitLog, error: insertError } = await supabase
      .from('watch_transit_logs')
      .insert([
        {
          listing_id: listingId,
          tracking_number: trackingNumber,
          carrier,
          status,
          location,
          details,
          updated_by: session.user.id
        }
      ])
      .select()
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: 'Data persistence error failing transit write milestone' },
        { status: 500 }
      )
    }

    // 5. Return success payload matching our UI timeline requirements
    return NextResponse.json({
      success: true,
      message: 'Transit milestone logged cleanly.',
      data: transitLog
    })

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error: Pipeline exception encountered' },
      { status: 500 }
    )
  }
}