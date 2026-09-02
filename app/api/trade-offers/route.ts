import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildCashTerms } from "@/lib/trade";

/* ════════════════════════════════════════════════════════════════════════
   /api/trade-offers — propose a trade, and read your own

   GET   every trade offer the caller is party to (proposer or recipient)
   POST  propose: target listing + one governed watch the caller controls

   ── BOTH WATCHES ARE VERIFIED IN THE DATABASE, EVERY TIME ─────────────
   The browser names two listing ids and nothing else. Admission is decided
   by propose_trade_offer(), inside one transaction with both listings
   locked: the target must exist, be acquirable, be open_to_trades, not be
   the caller's, and — if it is `private_active` — admit the caller as its
   designated `private_buyer_id`. The offered watch must be acquirable and
   the caller's own. Neither the proposer nor the recipient is taken from
   the request body; both are derived inside the function from auth.uid()
   and the locked rows.

   This route validates shape and renders errors. It is not the security
   boundary and must never become one again — see the note at the call.

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

/* The listing shape this route used to read and judge for itself is gone
   with the checks that needed it. propose_trade_offer() reads the rows it
   validates, under lock, and nothing here needs a copy of them. */

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

  /* Counterpart names — the OTHER party of each offer, resolved through
     public_seller_profiles, the sanctioned public-name path (see
     /api/messages GET: reading `profiles` directly silently degrades to
     nothing once RLS tightens to select-own; the view is what display
     names are shared through). Additive field: a client that ignores it
     behaves exactly as before, and a lookup failure costs the names,
     never the offers. */
  const offers = data ?? [];
  const counterpartIds = [
    ...new Set(
      offers
        .map((o) => (o.proposer_id === user.id ? o.recipient_id : o.proposer_id))
        .filter((id): id is string => typeof id === "string" && id !== "")
    ),
  ];
  let counterpartNames: Record<string, string | null> = {};
  if (counterpartIds.length > 0) {
    const { data: profiles } = await supabase
      .from("public_seller_profiles")
      .select("id, display_name")
      .in("id", counterpartIds);
    counterpartNames = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id as string, (p.display_name as string | null) ?? null])
    );
  }

  return NextResponse.json(
    { offers, viewerId: user.id, counterpartNames },
    { status: 200 }
  );
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

  /* ── THE MUTATION IS THE BOUNDARY, NOT THIS ROUTE ────────────────────
     Every admission rule below used to live here, in TypeScript, over rows
     this route had read with the SERVICE client moments earlier. Two things
     were wrong with that and only one of them was visible.

     The visible one: nothing compared the caller to `private_buyer_id`. A
     `private_active` listing is offered to ONE authorized buyer, and any
     signed-in collector holding its id could propose against it.

     The invisible one: read-then-write. Between the check and the insert the
     listing could change, and the insert would land against a row nobody had
     validated. There were no locks because a route cannot take one.

     propose_trade_offer() now does all of it inside a single transaction with
     both listings locked in deterministic id order — and authors the
     authoritative trade_offer_events row in that same transaction, which the
     two separate statements below could never guarantee.

     It runs on the SESSION client, not the service client: the function reads
     auth.uid() to decide who is proposing, and the service role carries no
     such identity. Same reason confirm_trade_leg_receipt is called that way. */
  const { data: created, error } = await supabase.rpc("propose_trade_offer", {
    p_target_listing_id: targetId,
    p_offered_listing_id: offeredId,
    p_cash_direction: cash.terms.cash_direction,
    p_cash_amount: cash.terms.cash_amount,
    p_cash_currency: cash.terms.cash_currency,
    p_note: typeof body.note === "string" ? body.note : null,
  });

  if (error) {
    const m = error.message;
    const says = (code: string) => m.includes(code);

    /* A non-designated caller must not be able to tell a private listing
       they may not touch from a listing that does not exist. They cannot
       read the row either (RLS), so "not found" is the answer that stays
       consistent with everything else the platform tells them. */
    if (says("target_private_not_designated") || says("target_not_found")) {
      return NextResponse.json(
        { error: "target_not_found", detail: "That listing does not exist." },
        { status: 404 }
      );
    }
    if (says("offered_not_found")) {
      return NextResponse.json({ error: "offered_not_found", detail: "That watch does not exist." }, { status: 404 });
    }
    if (says("not_authenticated")) {
      return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
    }
    if (says("same_watch")) {
      return NextResponse.json({ error: "same_watch", detail: "A watch cannot be traded for itself." }, { status: 400 });
    }
    if (says("own_listing")) {
      return NextResponse.json({ error: "own_listing", detail: "This is your own listing." }, { status: 409 });
    }
    if (says("not_open_to_trades")) {
      return NextResponse.json(
        { error: "not_open_to_trades", detail: "This seller is not accepting trade offers on this watch." },
        { status: 409 }
      );
    }
    if (says("target_not_available")) {
      const state = m.split("target_not_available:")[1]?.split(/[^a-z_]/)[0] ?? "unavailable";
      return NextResponse.json(
        { error: "target_not_available", detail: `This listing is ${state} and cannot be traded for.` },
        { status: 409 }
      );
    }
    if (says("offered_not_yours")) {
      return NextResponse.json(
        { error: "offered_not_yours", detail: "You can only offer a watch you control on FairWatchTrade." },
        { status: 403 }
      );
    }
    if (says("offered_not_available")) {
      const state = m.split("offered_not_available:")[1]?.split(/[^a-z_]/)[0] ?? "unavailable";
      return NextResponse.json(
        {
          error: "offered_not_available",
          detail: `The watch you're offering is ${state}. It must be live to take part in a trade.`,
        },
        { status: 409 }
      );
    }
    if (says("already_proposed")) {
      return NextResponse.json(
        {
          error: "already_proposed",
          detail: "You already have a trade proposal waiting on this watch. Withdraw it to send a different one.",
        },
        { status: 409 }
      );
    }
    console.error("[trade] propose failed:", m);
    return NextResponse.json({ error: "propose_failed", detail: "That proposal could not be sent." }, { status: 500 });
  }

  const result = created as {
    trade_offer_id: string;
    recipient_id: string;
    target_listing_id: string;
  } | null;
  if (!result?.trade_offer_id) {
    return NextResponse.json({ error: "propose_failed", detail: "That proposal could not be sent." }, { status: 500 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    /* The proposal is already committed and authoritative. A missing service
       client costs the bell, never the offer. */
    return NextResponse.json({ offer: { id: result.trade_offer_id } }, { status: 201 });
  }

  /* Read back the row the function wrote — its denormalised identity came
     from the LOCKED listings, so this is the authoritative copy rather than
     anything this route assembled. */
  const { data: offer } = await service
    .from("trade_offers")
    .select("*")
    .eq("id", result.trade_offer_id)
    .maybeSingle();

  /* The recipient's bell. Names the watch and is deduped on the offer
     itself. The lifecycle event is NOT written here any more — the function
     authored it in the same transaction as the offer. */
  await service.from("notifications").insert({
    user_id: result.recipient_id,
    type: "trade_offer",
    message: `A collector proposed a trade for your ${[offer?.target_brand, offer?.target_model]
      .filter(Boolean)
      .join(" ")}.`,
    listing_id: result.target_listing_id,
    dedupe_key: `trade_offer:${result.trade_offer_id}`,
  });

  return NextResponse.json({ offer: offer ?? { id: result.trade_offer_id } }, { status: 201 });
}
