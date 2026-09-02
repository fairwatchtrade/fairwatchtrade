import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   PATCH /api/trade-offers/[id] — accept · decline · withdraw

   ── ACCEPT GOES STRAIGHT TO THE DATABASE, ON PURPOSE ──────────────────
   accept_trade_offer() is SECURITY DEFINER and does the whole thing in one
   transaction: locks BOTH listings in deterministic sorted id order (the
   crossing-trade deadlock guard), re-checks that both watches are still
   acquirable and still controlled by the right people, supersedes the
   competing offers and cash requests on either watch, creates one deal
   with two directional legs, and reserves both listings.

   This route does not re-implement any of that and must never try. A trade
   that were assembled step by step from here could leave one watch
   reserved and the other freely sellable — the exact half-accepted state
   the acceptance law exists to prevent. The route's job is to call the
   function and turn its refusals into sentences.

   accept_purchase_request() is not called, extended, or generalized here.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The acceptance function's refusals, in the room's voice. */
const ACCEPT_REFUSALS: { match: RegExp; status: number; detail: string }[] = [
  { match: /not_authenticated/, status: 401, detail: "Sign in required." },
  { match: /not_allowed/, status: 403, detail: "Only the collector who received this offer can accept it." },
  {
    match: /already_resolved:(\w+)/,
    status: 409,
    detail: "This trade offer has already been answered.",
  },
  {
    match: /target_not_available/,
    status: 409,
    detail: "Your watch is no longer available to trade. Nothing was changed.",
  },
  {
    match: /offered_not_available/,
    status: 409,
    detail: "The watch you were offered is no longer available. Nothing was changed.",
  },
  {
    match: /target_not_controlled_by_recipient/,
    status: 409,
    detail: "This watch is no longer yours to trade. Nothing was changed.",
  },
  {
    match: /offered_not_controlled_by_proposer/,
    status: 409,
    detail: "The other collector no longer controls the watch they offered. Nothing was changed.",
  },
  {
    match: /target_not_open_to_trades/,
    status: 409,
    detail: "This listing is no longer open to trades. Nothing was changed.",
  },
  {
    match: /listing_already_accepted|listing_already_in_accepted_trade/,
    status: 409,
    detail: "One of these watches is already committed to another deal. Nothing was changed.",
  },
  { match: /not_found/, status: 404, detail: "No such trade offer." },
];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated", detail: "Sign in required." }, { status: 401 });
  }

  let body: { action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";

  // ── ACCEPT — one atomic call, no assembly here ──
  if (action === "accept") {
    const { data, error } = await supabase.rpc("accept_trade_offer", { p_offer_id: id });
    if (error) {
      const msg = error.message || "";
      const known = ACCEPT_REFUSALS.find((r) => r.match.test(msg));
      if (known) {
        return NextResponse.json(
          { error: msg.split(":")[0], detail: known.detail },
          { status: known.status }
        );
      }
      console.error("[trade] accept failed:", msg);
      return NextResponse.json(
        { error: "accept_failed", detail: "That trade could not be accepted. Nothing was changed." },
        { status: 500 }
      );
    }

    /* The proposer's bell, after the deal exists. Non-fatal by
       construction — a mail/notification failure must never unwind an
       accepted trade. */
    try {
      const service = createServiceClient();
      const { data: offer } = await service
        .from("trade_offers")
        .select("id, proposer_id, target_listing_id, target_brand, target_model")
        .eq("id", id)
        .maybeSingle();
      if (offer) {
        await service.from("notifications").insert({
          user_id: offer.proposer_id,
          type: "trade_accepted",
          message: `Your trade for the ${[offer.target_brand, offer.target_model]
            .filter(Boolean)
            .join(" ")} was accepted. Both watches are now reserved.`,
          listing_id: offer.target_listing_id,
          dedupe_key: `trade_accepted:${id}`,
        });
      }
    } catch (e) {
      console.error("[trade] accept notification failed:", e);
    }

    return NextResponse.json({ ok: true, ...(data as object) }, { status: 200 });
  }

  // ── DECLINE / WITHDRAW — one governed mutation, like accept ──
  if (action !== "decline" && action !== "withdraw") {
    return NextResponse.json(
      { error: "unknown_action", detail: "action must be accept, decline, or withdraw." },
      { status: 400 }
    );
  }

  /* These used to be a service-role UPDATE from here followed by a separate
     event insert whose error was discarded - a status change could exist
     with no history, which the founder's authoritative-history ruling
     forbids. resolve_trade_offer() now does both in one transaction and
     decides who may act from auth.uid(); the route calls it on the SESSION
     client and turns refusals into sentences. Decline belongs to the
     recipient; withdraw belongs to the proposer. Neither party can perform
     the other's act - the function enforces that, not this file. */
  const { data, error } = await supabase.rpc("resolve_trade_offer", {
    p_offer_id: id,
    p_action: action,
  });
  if (error) {
    const msg = error.message || "";
    if (/not_found/.test(msg)) {
      return NextResponse.json({ error: "not_found", detail: "No such trade offer." }, { status: 404 });
    }
    if (/not_allowed/.test(msg)) {
      return NextResponse.json(
        {
          error: "not_allowed",
          detail:
            action === "decline"
              ? "Only the collector who received this offer can decline it."
              : "Only the collector who made this offer can withdraw it.",
        },
        { status: 403 }
      );
    }
    if (/already_resolved/.test(msg)) {
      return NextResponse.json(
        { error: "already_resolved", detail: "This trade offer has already been answered." },
        { status: 409 }
      );
    }
    console.error("[trade] resolve failed:", msg);
    return NextResponse.json(
      { error: "update_failed", detail: "That did not go through. Nothing was changed." },
      { status: 500 }
    );
  }

  const result = data as { status: string; proposer_id: string } | null;
  const next = result?.status ?? (action === "decline" ? "declined" : "withdrawn");

  /* Only a decline needs to reach the other party - a withdrawal is the
     proposer taking back their own offer. The bell is non-fatal by
     construction: the decline is already committed and authoritative. */
  if (action === "decline" && result?.proposer_id) {
    try {
      const service = createServiceClient();
      await service.from("notifications").insert({
        user_id: result.proposer_id,
        type: "trade_declined",
        message: "Your trade proposal was declined.",
        dedupe_key: `trade_declined:${id}`,
      });
    } catch (e) {
      console.error("[trade] decline notification failed:", e);
    }
  }

  return NextResponse.json({ ok: true, status: next }, { status: 200 });
}
