import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/trade/transfer — record that a watch actually changed hands

   The producer's only door. It is deliberately thin: everything that makes
   a transfer assertion safe — the deal, leg and listing locks, the
   authorization test, the bead read, the 06D generation stamp, the event
   insert, the leg and parent recompute — happens inside one governed
   database function, in one transaction, where a browser cannot reach it.

   ── THE ACTOR IS THE SESSION, NEVER THE BODY ───────────────────────────
   There is no `actorUserId` field and this route never reads one. Who is
   asserting is taken from the authenticated session and passed to the
   function, which then decides whether that person is allowed to say this.
   A route that accepted an actor id would let any signed-in caller close
   anyone's transfer history.

   ── WHAT THE CALLER CANNOT ASK FOR ─────────────────────────────────────
   A provenance class. The caller says WHAT happened; the server decides
   what that assertion is worth. A recipient confirming receipt produces
   `party_confirmed_recipient`; the founder produces `founder_asserted`.
   Letting a request name its own provenance would make the strongest label
   on the platform a free-text field.

   Sender-alone assertion has no path here and none in the database. "I
   posted it" is a claim about a parcel, not knowledge that the object
   arrived.

   ── NOT INFERRED FROM ANYTHING ─────────────────────────────────────────
   No carrier webhook, no tracking poll, no delivery presumption, no timer.
   A transfer exists because a person with standing said it happened.

   ── WHY THE ORDER OF CHECKS INSIDE THE FUNCTION IS LOAD-BEARING ────────
   The producer takes its actor as an ARGUMENT, so it must authorize before
   it does anything else with a client-supplied value — including the
   idempotency key. That rule, and what a replay is allowed to mean, are
   written up in app/api/trade-offers/README.md.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

/* Bounded, governed reasons a call can fail. The database's message is
   never forwarded verbatim. */
const KNOWN_REASONS = new Set([
  "deal_not_found",
  "leg_not_found",
  "leg_does_not_belong_to_deal",
  "listing_carries_no_physical_watch_bead",
  "only_the_recipient_may_confirm_receipt",
  "founder_authorization_required",
  "leg_already_has_live_transfer",
  "retraction_must_supersede",
  "superseded_event_not_found",
  "only_a_transfer_may_be_retracted",
  "target_transfer_is_not_live",
  "retraction_target_inconsistent",
  "not_authorized_to_retract",
  "idempotency_key_required",
  /* A key that already exists under a DIFFERENT (leg, actor, event type) is
     a collision, never a replay. The producer refuses rather than returning
     the other event, so its id is never disclosed to a caller with no
     standing to see it. */
  "idempotency_key_conflict",
  "not_authenticated",
  "not_found",
  "deal_cancelled",
]);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const legId = typeof body.tradeDealLegId === "string" ? body.tradeDealLegId.trim() : "";
  const action = body.action === "retract" ? "retract" : "confirm";
  const supersedesEventId =
    typeof body.supersedesEventId === "string" && body.supersedesEventId.trim() !== ""
      ? body.supersedesEventId.trim()
      : null;
  const occurredAt = typeof body.occurredAt === "string" ? body.occurredAt : null;
  const idempotencyKey =
    typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";

  if (!legId) {
    return NextResponse.json({ error: "bad_request", detail: "tradeDealLegId required." }, { status: 400 });
  }
  if (!idempotencyKey) {
    /* Required, not generated here: the CALLER's retry must collapse into
       the same event, and a key invented per request would defeat that. */
    return NextResponse.json(
      { error: "bad_request", detail: "idempotencyKey required so a retry cannot duplicate history." },
      { status: 400 }
    );
  }
  if (action === "retract" && !supersedesEventId) {
    return NextResponse.json(
      { error: "bad_request", detail: "A retraction must name the transfer it withdraws." },
      { status: 400 }
    );
  }

  const db = createServiceClient();

  /* ── PROVENANCE IS CHOSEN BY ROLE, NOT BY IDENTITY ──────────────────
     This previously read `user.id === ADMIN_USER_ID ? founder_asserted :
     party_confirmed_recipient`, which is wrong the moment the founder is
     also an ordinary party — and in the first real deal on the platform he
     is, as the recipient of one leg. Confirming his own receipt would have
     been stamped `founder_asserted`: the strongest provenance label on the
     platform, applied to a perfectly ordinary act, permanently, in an
     append-only ledger.

     The question is not "who is this person" but "what standing are they
     acting under, on THIS leg". A recipient confirming their own receipt is
     a party confirmation whoever they happen to be. `founder_asserted` is
     the exception path — a founder asserting on evidence for a leg they do
     not own — and it must stay rare enough to mean something. */
  const { data: legRow } = await db
    .from("trade_deal_legs")
    .select("to_user_id")
    .eq("id", legId)
    .maybeSingle();

  const callerIsRecipient = legRow?.to_user_id === user.id;
  const provenanceClass = callerIsRecipient
    ? "party_confirmed_recipient"
    : user.id === ADMIN_USER_ID
      ? "founder_asserted"
      : "party_confirmed_recipient"; // refused downstream; never assumed here

  /* THE ORDINARY PATH GOES THROUGH THE WRAPPER, and it must run on the
     SESSION client rather than the service client: confirm_trade_leg_receipt
     reads auth.uid(), which the service role does not carry. The wrapper
     adds the one thing the producer deliberately does not own — the offer
     log's word for a completed deal — and derives its own idempotency key so
     a double tap collapses into one event.

     Retraction and founder assertion keep the direct producer call: neither
     completes a deal, and both are exception paths. */
  const useWrapper = action === "confirm" && callerIsRecipient;

  const { data, error } = useWrapper
    ? await supabase.rpc("confirm_trade_leg_receipt", { p_leg_id: legId })
    : await db.rpc("record_physical_watch_transfer_event", {
        p_trade_deal_leg_id: legId,
        p_event_type: action === "retract" ? "TRANSFER_RETRACTED" : "TRANSFERRED",
        p_actor_user_id: user.id,
        p_provenance_class: provenanceClass,
        p_occurred_at: occurredAt,
        p_supersedes_event_id: supersedesEventId,
        p_idempotency_key: idempotencyKey,
      });

  if (error) {
    const reason = [...KNOWN_REASONS].find((k) => error.message.includes(k)) ?? "rejected";
    const status = reason.includes("authoriz") || reason.includes("recipient") ? 403 : 400;
    return NextResponse.json({ error: "transfer_rejected", reason }, { status });
  }

  /* Returns the resulting state, not owner identities. from/to user ids are
     protected internal facts and never leave the database through here. */
  return NextResponse.json({ ok: true, result: data }, { status: 201 });
}
