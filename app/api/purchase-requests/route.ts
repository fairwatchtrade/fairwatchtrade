import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parsePrice } from "@/lib/parsePrice";
import { isSupportedCurrency } from "@/lib/supportedCurrencies";

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

  // Money Truth Stage B: the offer is parsed against the LISTING's currency,
  // which is read fresh below — so the parse is deferred until after that read.
  // An offer must use the listing's currency (order §6.4), so there is no
  // separate buyer-supplied currency to trust here.

  const message =
    typeof notes === "string" && notes.trim() !== ""
      ? notes.trim().slice(0, MAX_NOTE_LEN)
      : null;

  // FRESH authoritative listing read at submission — this is the snapshot
  // source of truth, not anything the browser sent.
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, brand, model, reference, seller_id, asking_price, asking_currency, status, private_buyer_id")
    .eq("id", listingId)
    .single();

  if (listingError || !listing) {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }

  // Availability: exists but no longer open to new requests (e.g. reserved after
  // an accepted offer). Typed so the UI shows the "no longer available" state.
  // Private Listing V1 (v5.98): a Private Active listing enters the SAME
  // machinery, but only for its one authorized buyer — an eligibility
  // extension, not a second engine. The database creation guard enforces the
  // same rule independently; this check exists for the clean status code.
  const privateForMe =
    listing.status === "private_active" &&
    (listing as { private_buyer_id?: string | null }).private_buyer_id === user.id;
  if (listing.status !== "published" && !privateForMe) {
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
  // Money Truth Stage B: offer currency IS listing currency (order §6.4). A
  // listing with no currency yet (the legacy B→C window) cannot receive a
  // governed offer — refuse rather than guess USD.
  const listingCurrency = listing.asking_currency as string | null;
  // The refusal gets its OWN reason rather than falling through to the parser's
  // "unsupported_currency". The parser's message asks the reader to choose a
  // currency, which is seller copy — a buyer has no currency to choose here.
  if (!isSupportedCurrency(listingCurrency)) {
    return NextResponse.json(
      {
        error: "listing_currency_unset",
        detail:
          "This listing's currency has not been recorded yet, so it can't receive an offer.",
      },
      { status: 409 }
    );
  }
  const offerParse = parsePrice(proposedPurchasePrice ?? null, listingCurrency);
  if (!offerParse.ok || offerParse.amount > MAX_OFFER) {
    return NextResponse.json(
      {
        error: "invalid_amount",
        detail: offerParse.ok
          ? "That offer is too large."
          : offerParse.message,
      },
      { status: 400 }
    );
  }
  const price = offerParse.amount;

  const shownParse = parsePrice(displayedAskingPrice ?? null, listingCurrency);
  const shownAsking = shownParse.ok ? shownParse.amount : null;
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
      // Stage A snapshot columns: the offer's currency and the listing's
      // currency AT SUBMISSION, preserved alongside the amounts (order §6.4).
      listing_currency: listingCurrency,
      proposed_currency: listingCurrency,
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

  // Seller notification — v2.89 (WS5): owned by the DATABASE now. The old
  // client-session insert here was RLS-denied on every call since birth
  // (notifications has no INSERT policy) and failed silently. The
  // purchase_requests_notify_seller trigger writes the bell RLS-exempt with
  // the recipient fixed to the row's seller_id — the notify_on_listing_publish
  // pattern. No route-side insert remains.

  return NextResponse.json({ id: inserted.id, proposedPurchasePrice: price });
}
