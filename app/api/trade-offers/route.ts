import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildCashTerms, isTradeable } from "@/lib/trade";

/* ════════════════════════════════════════════════════════════════════════
   /api/trade-offers — propose a trade, and read your own

   GET   every trade offer the caller is party to (proposer or recipient)
   POST  propose: target listing + one governed watch the caller controls

   ── BOTH WATCHES ARE VERIFIED SERVER-SIDE, EVERY TIME ─────────────────
   The browser names two listing ids and nothing else. This route proves,
   with the trusted client, that: the target exists, is acquirable, is
   open_to_trades, and is NOT the caller's; and that the offered watch is
   acquirable and IS the caller's. Neither the proposer nor the recipient
   is taken from the request body — both are derived.

   ── WHY A GOVERNED WATCH, NOT A PHOTO AND A PARAGRAPH ─────────────────
   The offered object must carry the same identity, ownership, lifecycle
   and review machinery the target does. A pasted link or a typed
   description would bypass exactly what makes this different from a DM
   negotiation, so V1 accepts only a listing the caller already controls —
   `private_active` included, which is how a watch that is not publicly for
   sale takes part without inventing a collection object.

   Nothing here touches purchase_requests.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListingRow = {
  id: string;
  seller_id: string;
  status: string;
  brand: string;
  model: string | null;
  reference: string | null;
  public_code: string | null;
  open_to_trades: boolean | null;
};

const LISTING_COLUMNS =
  "id, seller_id, status, brand, model, reference, public_code, open_to_trades";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  /* RLS returns only offers the caller is party to — the filter is the
     policy, not this query. */
  const { data, error } = await supabase
    .from("trade_offers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "read_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ offers: data ?? [], viewerId: user.id }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  let body: {
    targetListingId?: unknown;
    offeredListingId?: unknown;
    cashDirection?: unknown;
    cashAmount?: unknown;
    cashCurrency?: unknown;
    note?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }

  const targetId = typeof body.targetListingId === "string" ? body.targetListingId : "";
  const offeredId = typeof body.offeredListingId === "string" ? body.offeredListingId : "";
  if (!targetId || !offeredId) {
    return NextResponse.json(
      { error: "bad_request", detail: "Both the watch you want and the watch you're offering are required." },
      { status: 400 }
    );
  }
  if (targetId === offeredId) {
    return NextResponse.json(
      { error: "same_watch", detail: "A watch cannot be traded for itself." },
      { status: 400 }
    );
  }

  const cash = buildCashTerms({
    direction: body.cashDirection ?? "none",
    amount: body.cashAmount,
    currency: body.cashCurrency,
  });
  if (!cash.ok) {
    return NextResponse.json({ error: "bad_cash_terms", detail: cash.error }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "server_misconfigured", detail: "Unavailable." }, { status: 500 });
  }

  const { data: listings } = await service
    .from("listings")
    .select(LISTING_COLUMNS)
    .in("id", [targetId, offeredId]);
  const rows = (listings ?? []) as ListingRow[];
  const target = rows.find((l) => l.id === targetId);
  const offered = rows.find((l) => l.id === offeredId);

  if (!target) {
    return NextResponse.json({ error: "target_not_found", detail: "That listing does not exist." }, { status: 404 });
  }
  if (!offered) {
    return NextResponse.json({ error: "offered_not_found", detail: "That watch does not exist." }, { status: 404 });
  }

  // The target: someone else's, acquirable, and explicitly open to trades.
  if (target.seller_id === user.id) {
    return NextResponse.json(
      { error: "own_listing", detail: "This is your own listing." },
      { status: 409 }
    );
  }
  if (target.open_to_trades !== true) {
    return NextResponse.json(
      { error: "not_open_to_trades", detail: "This seller is not accepting trade offers on this watch." },
      { status: 409 }
    );
  }
  if (!isTradeable(target.status)) {
    return NextResponse.json(
      { error: "target_not_available", detail: `This listing is ${target.status} and cannot be traded for.` },
      { status: 409 }
    );
  }

  // The offered watch: the caller's own, and equally acquirable.
  if (offered.seller_id !== user.id) {
    return NextResponse.json(
      { error: "offered_not_yours", detail: "You can only offer a watch you control on FairWatchTrade." },
      { status: 403 }
    );
  }
  if (!isTradeable(offered.status)) {
    return NextResponse.json(
      {
        error: "offered_not_available",
        detail: `The watch you're offering is ${offered.status}. It must be live to take part in a trade.`,
      },
      { status: 409 }
    );
  }

  const { data: offer, error } = await service
    .from("trade_offers")
    .insert({
      target_listing_id: target.id,
      offered_listing_id: offered.id,
      proposer_id: user.id,
      // Derived from the listing, never from the request body.
      recipient_id: target.seller_id,
      status: "pending",
      ...cash.terms,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null,
      target_brand: target.brand,
      target_model: target.model,
      target_reference: target.reference,
      offered_brand: offered.brand,
      offered_model: offered.model,
      offered_reference: offered.reference,
      /* Durable identity, captured at write time exactly as trade_deal_legs
         captures listing_public_code — so a terminal offer stays legible
         after its listing references detach (v6.93). */
      target_public_code: target.public_code,
      offered_public_code: offered.public_code,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    // The one-pending-per-proposer index doing its job.
    if (error.code === "23505") {
      return NextResponse.json(
        {
          error: "already_proposed",
          detail: "You already have a trade proposal waiting on this watch. Withdraw it to send a different one.",
        },
        { status: 409 }
      );
    }
    console.error("[trade] propose failed:", error.message);
    return NextResponse.json({ error: "propose_failed", detail: error.message }, { status: 500 });
  }

  await service.from("trade_offer_events").insert({
    trade_offer_id: offer!.id,
    event_type: "proposed",
    actor_user_id: user.id,
    prior_status: null,
    resulting_status: "pending",
    metadata: {
      target_listing_id: target.id,
      offered_listing_id: offered.id,
      ...cash.terms,
    },
  });

  /* The recipient's bell. Names both watches and the direction of cash,
     never a formula — and is deduped on the offer itself. */
  await service.from("notifications").insert({
    user_id: target.seller_id,
    type: "trade_offer",
    message: `A collector proposed a trade for your ${[target.brand, target.model]
      .filter(Boolean)
      .join(" ")}.`,
    listing_id: target.id,
    dedupe_key: `trade_offer:${offer!.id}`,
  });

  return NextResponse.json({ offer }, { status: 201 });
}
