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

  /* Derived from WHO is calling, never from what they sent. The database
     re-checks standing regardless — this only picks which claim is being
     attempted. */
  const provenanceClass =
    user.id === ADMIN_USER_ID ? "founder_asserted" : "party_confirmed_recipient";

  const db = createServiceClient();
  const { data, error } = await db.rpc("record_physical_watch_transfer_event", {
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
