import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/trades/[dealId]/cancel — either party calls the trade off

   Legal only while BOTH legs are still pre-transfer. The refusal that
   matters is asked of the transfer LEDGER, not of leg_status, because
   leg_status is a cache derived from that ledger and the ledger is the
   truth. Once a watch has genuinely changed hands, ordinary cancellation is
   over: recovery from there is founder-only, through TRANSFER_RETRACTED,
   and it supersedes rather than deletes.

   Cancelling emits NO transfer event, because nothing was transferred. It
   releases both listings back to the market — reconstructing whether each
   was published or private, since acceptance overwrote that and is frozen.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const dynamic = "force-dynamic";

const KNOWN = new Set([
  "not_authenticated",
  "not_found",
  "not_allowed",
  "already_cancelled",
  "deal_completed",
  "cannot_cancel_after_transfer",
]);

const SENTENCE: Record<string, string> = {
  not_allowed: "This trade isn't yours to cancel.",
  already_cancelled: "This trade was already cancelled.",
  deal_completed: "This trade is complete — both watches have changed hands.",
  cannot_cancel_after_transfer:
    "One of the watches has already been confirmed as received, so this trade can no longer be cancelled here.",
  not_found: "That trade no longer exists.",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dealId: string }> }
) {
  const { dealId } = await params;
  if (!dealId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let reason: string | null = null;
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body?.reason === "string" && body.reason.trim() !== "") {
      reason = body.reason.trim();
    }
  } catch {
    /* no body — reason stays null */
  }

  const { data, error } = await supabase.rpc("cancel_trade_deal", {
    p_deal_id: dealId,
    p_reason: reason,
  });

  if (error) {
    const key = [...KNOWN].find((k) => error.message.includes(k)) ?? "rejected";
    const status = key === "not_allowed" ? 403 : key === "not_found" ? 404 : 409;
    return NextResponse.json(
      { error: key, detail: SENTENCE[key] ?? "Could not cancel this trade." },
      { status }
    );
  }

  return NextResponse.json({ ok: true, result: data }, { status: 200 });
}
