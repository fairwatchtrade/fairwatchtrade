import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/trades/legs/[legId]/sent — the sender says the watch is posted

   ⚠ THIS IS NOT A TRANSFER, AND THE DISTINCTION IS THE WHOLE POINT.

   `record_physical_watch_transfer_event()` refuses a sender outright:
   only_the_recipient_may_confirm_receipt. Sent must not become a side door
   around that rule. So this route writes NO transfer event, never touches
   the physical-watch bead, and moves no ownership truth. It sets one
   advisory column and stops.

   Saying "I posted it" is honest and worth saying — two watches are in
   motion with no escrow between them, and the thing the other collector is
   actually anxious about is whether the parcel left. It is not knowledge
   that anything arrived.

   ── ADVISORY, NEVER A GATE ─────────────────────────────────────────────
   bound → transferred stays legal without ever passing through here. Two
   collectors meeting in person is a real trade, and a flow that demanded a
   postage step would be lying about how that watch moved.

   ── REVERSIBLE, BECAUSE A MISTAKEN SENT IS A UI SLIP ───────────────────
   `{ sent: false }` returns the leg to bound while it is still in_transit.
   Nothing about the world is being retracted — only a statement about a
   parcel that had not left after all.

   Authorization is the function's: only the leg's from_user_id may call it,
   and it is the only new authorization this round introduced.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

const KNOWN = new Set([
  "not_authenticated",
  "not_found",
  "only_the_sender_may_mark_sent",
  "deal_cancelled",
  "leg_already_transferred",
  "leg_cancelled",
]);

const SENTENCE: Record<string, string> = {
  only_the_sender_may_mark_sent: "Only the collector sending this watch can mark it sent.",
  deal_cancelled: "This trade has been cancelled.",
  leg_already_transferred: "This watch has already been confirmed as received.",
  leg_cancelled: "This leg of the trade is cancelled.",
  not_found: "That trade leg no longer exists.",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ legId: string }> }
) {
  const { legId } = await params;
  if (!legId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  /* Absent body means "sent". Undo has to ask for itself. */
  let sent = true;
  try {
    const body = (await request.json()) as { sent?: unknown };
    if (body && typeof body.sent === "boolean") sent = body.sent;
  } catch {
    /* no body — stays true */
  }

  const { data, error } = await supabase.rpc("mark_trade_leg_sent", {
    p_leg_id: legId,
    p_sent: sent,
  });

  if (error) {
    const reason = [...KNOWN].find((k) => error.message.includes(k)) ?? "rejected";
    const status = reason === "only_the_sender_may_mark_sent" ? 403 : 409;
    return NextResponse.json(
      { error: reason, detail: SENTENCE[reason] ?? "Could not update this leg." },
      { status }
    );
  }

  return NextResponse.json({ ok: true, result: data }, { status: 200 });
}
