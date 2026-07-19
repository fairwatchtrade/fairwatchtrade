import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePrice } from "@/lib/parsePrice";

/* ────────────────────────────────────────────────────────────────────────
   PURCHASE REQUESTS — POST /api/purchase-requests  (v2.28)

   GOVERNING LAW: the buyer proposes a price and may add a message. The
   seller's listing supplies the commercial and fulfillment truth. The SERVER
   — not the browser — creates the authoritative snapshot at submission.

   The buyer authors ONLY:
     · proposed_purchase_price
     · notes (the optional message)
   Everything else is derived server-side from a FRESH listing read at
   submission time (never trusted from the client body).

   v2.28 corrections (Buyer Purchase Request flight):
   · The body no longer carries shipping_terms / included_items — and, more
     importantly, this route no longer READS or STORES them even if a client
     sends them. Removing the fields from the form was not enough while the API
     still trusted buyer-authored seller truth. Both columns are written NULL
     in the new path (kept for compatibility; not retired this flight).
   · Server-side amount validation is now positive-only with an explicit upper
     bound, sanitized through the shared parsePrice (commas/$/decimals), so a
     hostile or malformed payload can't insert a zero/negative/garbage offer.
   · Listing-change detection: the client may send displayedAskingPrice as a
     NON-authoritative comparison reference only. The server ignores it for the
     snapshot (it always fresh-reads and snapshots the current asking price)
     and, if it differs, returns a typed `listing_changed` so the buyer can
     review current truth before resubmitting.
   · Availability is a typed `listing_unavailable` (not a generic 404) when the
     listing exists but is no longer published (e.g. reserved after an accept),
     including the DB creation-guard's own errors.

   buyer_id is ALWAYS auth.getUser() — never the body. Zero dollars move here.
   ──────────────────────────────────────────────────────────────────────── */

// Explicit offer bounds. Lower bound is enforced by parsePrice (> 0); the upper
// bound is a generous sanity ceiling so a fat-fingered or hostile amount can't
// store an absurd number. Not a business rule about watch value — just a guard.
const MAX_OFFER = 100_000_000;
const MAX_NOTE_LEN = 2000;

type RequestBody = {
  listingId?: string;
  proposedPurchasePrice?: number | string;
  notes?: string;
  // Non-authoritative: the asking price the buyer saw when the form loaded.
  // Used ONLY to detect a mid-session change; never stored, never trusted as
  // the snapshot value.
  displayedAskingPrice?: number | string;
};

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No false success after 401 — the client maps this to the expired-session
  // state and re-authenticates; nothing is written.
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const { listingId, proposedPurchasePrice, notes, displayedAskingPrice } = body;

  if (!listingId || typeof listingId !== "string") {
    return NextResponse.json(
      { error: "invalid_body", detail: "listingId is required." },
      { status: 400 }
    );
  }

  // Server-side amount sanitation + bounds. parsePrice strips $/commas/space and
  // returns null for empty/garbage/zero/negative; we add the upper bound.
  const price = parsePrice(proposedPurchasePrice ?? null);
  if (price === null || price > MAX_OFFER) {
    return NextResponse.json(
      { error: "invalid_amount", detail: "Enter an offer greater than $0 using numbers only." },
      { status: 400 }
    );
  }

  const message =
    typeof notes === "string" && notes.trim() !== ""
      ? notes.trim().slice(0, MAX_NOTE_LEN)
      : null;

  // FRESH authoritative listing read at submission — this is the snapshot
  // source of truth, not anything the browser sent.
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, brand, model, reference, seller_id, asking_price, status")
    .eq("id", listingId)
    .single();

  if (listingError || !listing) {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }

  // Availability: exists but no longer open to new requests (e.g. reserved after
  // an accepted offer). Typed so the UI shows the "no longer available" state.
  if (listing.status !== "published") {
    return NextResponse.json(
      { error: "listing_unavailable", detail: "This watch is no longer available for a new purchase request." },
      { status: 409 }
    );
  }

  // A seller can't purchase-request their own listing.
  if (listing.seller_id === user.id) {
    return NextResponse.json(
      { error: "not_allowed", detail: "You can't request your own listing." },
      { status: 403 }
    );
  }

  // Listing-change detection. displayedAskingPrice is advisory ONLY: if the
  // buyer saw a different asking price than the current fresh value, stop and
  // let them review current truth. The snapshot below still uses the fresh
  // server value regardless.
  const freshAsking = Number(listing.asking_price);
  const shownAsking = parsePrice(displayedAskingPrice ?? null);
  if (shownAsking !== null && shownAsking !== freshAsking) {
    return NextResponse.json(
      {
        error: "listing_changed",
        detail: "The seller updated the asking price. Review the current listing before submitting your offer.",
        old: shownAsking,
        current: freshAsking,
      },
      { status: 409 }
    );
  }

  // Friendly pre-check for the one-active-pending-per-buyer rule. The database
  // (partial unique index + creation-guard trigger, v2.27) is the authority;
  // this is only for a clean message ahead of the constraint.
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

  // Authoritative snapshot. Buyer authors only proposed_purchase_price + notes.
  // listing_price + identity are snapshotted from the fresh read above.
  // shipping_terms / included_items are intentionally NULL — no authoritative
  // listing source exists and the buyer must not author them.
  const { data: inserted, error: insertError } = await supabase
    .from("purchase_requests")
    .insert({
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
      listing_price: freshAsking,
      listing_brand: listing.brand,
      listing_model: listing.model ?? null,
      listing_reference: listing.reference ?? null,
      proposed_purchase_price: price,
      shipping_terms: null,
      included_items: null,
      notes: message,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // Map the database authority (unique pending index / creation-guard trigger)
    // to typed responses instead of a generic 500.
    const msg = insertError?.message ?? "";
    if (msg.includes("purchase_requests_one_pending_per_buyer")) {
      return NextResponse.json(
        { error: "duplicate_request", detail: "You already have a pending request on this listing." },
        { status: 409 }
      );
    }
    if (msg.includes("listing_already_accepted") || msg.includes("listing_not_available")) {
      return NextResponse.json(
        { error: "listing_unavailable", detail: "This watch is no longer available for a new purchase request." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  // Seller notification — existing bell system. Fails open.
  const watchLabel = listing.model ? `${listing.brand} ${listing.model}` : listing.brand;
  await supabase.from("notifications").insert({
    user_id: listing.seller_id,
    type: "purchase_request",
    message: `New purchase request for your ${watchLabel}`,
    listing_id: listing.id,
  });

  return NextResponse.json({ id: inserted.id, proposedPurchasePrice: price });
}
