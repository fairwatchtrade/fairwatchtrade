import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { retryItemPhotographs } from "@/lib/dealer/manifestAdapter";
import { materializeOneItem } from "@/lib/dealer/materializationBridge";
import { buildDealerAcceleratorState } from "@/lib/dealer/dealerPath";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/dealer-accelerator/retry-item — TRY AGAIN, made true

   Founder ruling (Build A): a dealer may explicitly retry ONE failed item
   after correcting their source. This route is that action, end to end,
   while the dealer watches:

     re-arm this item's failed photographs   (governed, append-only event)
     -> fetch them under the worker's own laws
     -> if the evidence is now complete, materialize through the normal path

   ── What bounds it ─────────────────────────────────────────────────────
   One item per call, named by the dealer's click. No batch, source, or
   authorization is created. No other item is read, let alone restarted.
   The database function refuses non-owners and non-blocked items, so those
   properties hold even if this route is called with a forged body.

   ── Failure is a first-class outcome ───────────────────────────────────
   If the source is still broken, the new failure is recorded exactly like
   the old one and the item stays truthfully in Needs Attention. The dealer
   is told which of their photographs still failed — not "try again later".
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** One item: a couple of photograph fetches plus one materialization. 60 is
    the platform ceiling; this finishes far inside it. */
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Engine refusals → dealer sentences. Anything unmapped falls through with
    its code visible rather than a blank. */
const REFUSAL_COPY: Record<string, string> = {
  not_item_owner: "This watch belongs to a different account.",
  "item_not_blocked": "This watch is not waiting on a retry.",
  no_failed_photographs:
    "This watch has no failed photographs to retry. If it still needs attention, the issue is in its listing details, not its photographs.",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: { batchItemId?: string };
  try {
    body = (await request.json()) as { batchItemId?: string };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const batchItemId = (body.batchItemId ?? "").trim();
  if (!UUID_RE.test(batchItemId)) {
    return NextResponse.json({ error: "batch_item_id_required" }, { status: 400 });
  }

  /* The identifiers materialization needs, read up front. Ownership is
     re-proven inside the re-arm function with a row lock — this read only
     shapes the later call and gives a clean 404 for a foreign item instead
     of a raised exception. */
  const db = createServiceClient();
  const { data: itemRow } = await db
    .from("dealer_accelerator_batch_items")
    .select("id,source_id,dealer_profile_id,source_item_id")
    .eq("id", batchItemId)
    .maybeSingle();
  const item = itemRow as {
    id: string;
    source_id: string;
    dealer_profile_id: string;
    source_item_id: string;
  } | null;
  if (!item || item.dealer_profile_id !== user.id) {
    return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  }
  const { data: siRow } = await db
    .from("dealer_accelerator_source_items")
    .select("source_item_key")
    .eq("id", item.source_item_id)
    .maybeSingle();
  const sourceItemKey = (siRow as { source_item_key: string } | null)?.source_item_key;
  if (!sourceItemKey) {
    return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  }

  // ── Re-arm + fetch ──
  let retry;
  try {
    retry = await retryItemPhotographs({ batchItemId, actorUserId: user.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "retry_failed";
    // Engine refusals arrive as "dealer_accelerator_retry_item_photographs: code".
    const code = msg.split(": ").pop() ?? msg;
    const mapped = Object.keys(REFUSAL_COPY).find((k) => code.startsWith(k));
    return NextResponse.json(
      {
        ok: false,
        failure: mapped ?? "retry_failed",
        message: mapped ? REFUSAL_COPY[mapped] : `The retry could not start (${code}).`,
      },
      { status: mapped ? 200 : 500 }
    );
  }

  /* ── Materialize through the normal path, whatever the fetch outcome ──
     If every photograph arrived, assessment finds the evidence complete,
     unblocks the item, and creates the draft. If some still failed,
     assessment re-blocks with the current truthful reason. Either way the
     item's state is REAL afterwards — this call never leaves it half-way. */
  let outcome: string;
  let listingId: string | null = null;
  let blockedReason: string | null = null;
  try {
    const result = await materializeOneItem({
      sourceId: item.source_id,
      sourceItemKey,
      batchItemId,
      actorUserId: user.id,
      actorKind: "dealer",
      mode: "materialize",
    });
    outcome = result.outcome;
    listingId = result.listingId;
    blockedReason = result.blockedReasonCode;
  } catch (e) {
    outcome = "MATERIALIZATION_FAILED";
    blockedReason = e instanceof Error ? e.message : "unknown";
  }

  const state = await buildDealerAcceleratorState(user.id);
  return NextResponse.json({
    ok: true,
    retry: {
      rearmed: retry.rearmed,
      retrieved: retry.retrieved,
      stillFailing: retry.failedRetryable + retry.failedTerminal,
      failureSample: retry.failureSample,
    },
    outcome,
    listingId,
    blockedReason,
    state,
  });
}
