import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ────────────────────────────────────────────────────────────────────────
   PURCHASE REQUESTS — POST /api/purchase-requests  (v2.4a)

   Buyer submits a purchase request on a listing. buyer_id is ALWAYS derived
   from auth.getUser() server-side — never trusted from the client body, same
   principle as /api/listings.

   Exclusivity rule (confirmed by the chain): one active PENDING request per
   buyer per listing — not exclusive platform-wide. Enforced here with a
   pre-insert check; no DB uniqueness constraint, per brief.

   On success, also inserts a row into the existing `notifications` table so
   the seller's bell surfaces the new request — no changes to the bell UI
   itself (already built, v1.92).

   Zero dollars move in this route. No Escrow.com, no Stripe — future flight.

   NOTE: this file's content is unchanged since its original delivery. Every
   subsequent revision this project has made to purchase-requests logic
   (RLS fix, checked-transaction fix, the Flight B atomic accept function)
   touched ONLY app/api/purchase-requests/[id]/route.ts — never this file.
   If this file is ever missing from the flat purchase-requests folder,
   this is the correct, complete content to restore.
   ──────────────────────────────────────────────────────────────────────── */

type RequestBody = {
  listingId?: string;
  proposedPurchasePrice?: number;
  shippingTerms?: string;
  includedItems?: string;
  notes?: string;
};

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { listingId, proposedPurchasePrice, shippingTerms, includedItems, notes } = body;

  if (
    !listingId ||
    typeof proposedPurchasePrice !== "number" ||
    !Number.isFinite(proposedPurchasePrice)
  ) {
    return NextResponse.json(
      { error: "invalid_body", detail: "listingId and proposedPurchasePrice are required." },
      { status: 400 }
    );
  }

  // Fetch the listing for seller_id, current asking price (snapshotted onto
  // the request as listing_price), and brand/model for the notification text.
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, brand, model, reference, seller_id, asking_price, status")
    .eq("id", listingId)
    .single();

  if (listingError || !listing || listing.status !== "published") {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }

  // A seller can't purchase-request their own listing.
  if (listing.seller_id === user.id) {
    return NextResponse.json(
      { error: "not_allowed", detail: "You can't request your own listing." },
      { status: 403 }
    );
  }

  // Exclusivity check — one active pending request per buyer per listing.
  const { data: existing } = await supabase
    .from("purchase_requests")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "duplicate_request", detail: "You already have a pending request on this listing." },
      { status: 409 }
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("purchase_requests")
    .insert({
      listing_id: listingId,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      listing_price: listing.asking_price,
      // v2.27 — identity snapshot, captured at request time. Lets My Offers
      // show the watch identity + outcome to a superseded/declined buyer even
      // after the listing is reserved and RLS denies them the listing row.
      listing_brand: listing.brand,
      listing_model: listing.model ?? null,
      listing_reference: listing.reference ?? null,
      proposed_purchase_price: proposedPurchasePrice,
      shipping_terms: shippingTerms ?? null,
      included_items: includedItems ?? null,
      notes: notes ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Seller notification — existing table/bell system. Fails open: a
  // notification hiccup shouldn't undo an already-successful request.
  // NOTE: brief's message template was `${brand} ${model}` unconditionally;
  // model can be null on a listing, so this falls back to brand-only to
  // avoid a literal "null" in the seller's notification text.
  const watchLabel = listing.model ? `${listing.brand} ${listing.model}` : listing.brand;
  await supabase.from("notifications").insert({
    user_id: listing.seller_id,
    type: "purchase_request",
    message: `New purchase request for your ${watchLabel}`,
    listing_id: listingId,
  });

  return NextResponse.json({ id: inserted.id });
}
