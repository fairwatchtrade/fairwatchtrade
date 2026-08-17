import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { advancePreparation, buildDealerAcceleratorState } from "@/lib/dealer/dealerPath";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/dealer-accelerator/start

   The dealer's own ignition. Does one bounded unit of preparation while the
   dealer waits, answers with real progress, and then keeps going after the
   response so leaving the page does not stall the run.

   ── Why the work is bounded and repeatable, not one long call ──────────
   The spine records every step and resumes from any interruption, so the
   honest shape of this operation is "advance it, truthfully report where it
   got to, and let something advance it again." That something can be this
   route called again, the after() continuation below, or the scheduled
   worker — all three drive the identical idempotent path, and a repeat
   converges instead of duplicating.

   ── What after() does and does not buy ────────────────────────────────
   after() extends THIS invocation past the response, up to maxDuration. It
   is not a background job runner. It closes the common case — a dealer
   clicks start and navigates away while a small inventory finishes — but
   the durable guarantee for a run that outlives one invocation is the
   scheduled worker, not this. Do not let this comment rot into a claim
   that after() is the worker.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 60 is the ceiling on every current plan tier, so this deploys anywhere.
    The budgets below are chosen to finish inside it with room to spare. */
export const maxDuration = 60;

/** Held back from maxDuration so the response is always sent. */
const FOREGROUND_BUDGET_MS = 12_000;
/** The after() continuation's share of what remains. */
const CONTINUATION_BUDGET_MS = 35_000;
/** Bounds the continuation chain. Each pass is already time-boxed; this
    stops a pathological source from looping until the platform kills it. */
const MAX_CONTINUATION_PASSES = 4;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: { sourceId?: string };
  try {
    body = (await request.json()) as { sourceId?: string };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const sourceId = (body.sourceId ?? "").trim();
  if (!UUID_RE.test(sourceId)) {
    return NextResponse.json({ error: "source_id_required" }, { status: 400 });
  }

  // Ownership is proven inside advancePreparation against the stored row —
  // a source id from a client is an assertion, not a fact.
  const userId = user.id;
  let report;
  try {
    report = await advancePreparation({ userId, sourceId, budgetMs: FOREGROUND_BUDGET_MS });
  } catch (e) {
    return NextResponse.json(
      { error: "preparation_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }

  if (!report.ok) {
    // A refusal here is specific and safe to show: an unresolvable source, a
    // suspended authorization, a source that moved. Never a generic failure.
    return NextResponse.json({ ok: false, failure: report.detail }, { status: 200 });
  }

  // Keep working after the response for as long as this invocation may live.
  if (!report.finished) {
    after(async () => {
      try {
        for (let pass = 0; pass < MAX_CONTINUATION_PASSES; pass++) {
          const next = await advancePreparation({
            userId,
            sourceId,
            budgetMs: Math.floor(CONTINUATION_BUDGET_MS / MAX_CONTINUATION_PASSES),
          });
          if (!next.ok || next.finished) break;
        }
      } catch {
        // The run is durable and resumable; losing a continuation costs
        // time, never state. The scheduled worker picks it up.
      }
    });
  }

  const state = await buildDealerAcceleratorState(userId);
  return NextResponse.json({ ok: true, report, state });
}
