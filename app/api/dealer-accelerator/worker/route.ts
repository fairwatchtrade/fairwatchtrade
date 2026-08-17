import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { advancePreparation } from "@/lib/dealer/dealerPath";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/dealer-accelerator/worker — the scheduled continuation

   The durable half of "you can leave this page." A dealer's run survives
   them closing the tab because something other than their browser advances
   it. This is that something.

   ── Not a new engine ──────────────────────────────────────────────────
   It calls exactly the same advancePreparation the dealer's own start
   button calls. There is one preparation path; this route only supplies the
   heartbeat. If the two ever diverge, the divergence is the bug.

   ── Authentication is a shared secret, and it fails CLOSED ────────────
   No user session exists on a scheduled call, so the gate is
   DEALER_WORKER_SECRET compared in constant time. If the variable is
   absent the route refuses every request rather than running unauthenticated
   — an open worker would let anyone drive other people's imports.

   ── Bounded per invocation, fair across dealers ───────────────────────
   Each call gives a bounded slice of time to a bounded number of runs, and
   picks up the least-recently-advanced ones first, so one large inventory
   cannot starve everyone else's. Whatever it does not finish, the next tick
   continues; the spine loses nothing in between.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Runs advanced per tick. Small on purpose: more ticks beats long ticks
    when every tick is resumable. */
const MAX_RUNS_PER_TICK = 4;
/** Time budget handed to each run this tick. */
const PER_RUN_BUDGET_MS = 10_000;

/** Constant-time comparison — a timing-variable check on a shared secret is
    a real weakness, and the fix costs nothing. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const expected = process.env.DEALER_WORKER_SECRET;
  // Fail closed. An unconfigured worker does nothing; it never runs open.
  if (!expected || expected.length < 16) {
    return NextResponse.json({ error: "worker_not_configured" }, { status: 503 });
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!secretMatches(provided, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createServiceClient();

  // Candidate runs: batches that are not settled, or that are settled but
  // still hold unmaterialized items (an interruption between phases). The
  // same "advanceable" definition the dealer's own room reads, expressed
  // here as a query rather than recomputed per dealer.
  const { data: batchRows, error } = await db
    .from("dealer_accelerator_batches")
    .select("id,source_id,dealer_profile_id,status,updated_at")
    .in("status", ["queued", "running", "cancel_requested"])
    .order("updated_at", { ascending: true })
    .limit(MAX_RUNS_PER_TICK);

  if (error) {
    return NextResponse.json({ error: "candidate_read_failed", detail: error.message }, { status: 500 });
  }

  const candidates = (batchRows ?? []) as Array<{
    id: string;
    source_id: string;
    dealer_profile_id: string;
  }>;

  const advanced: Array<{ batchId: string; detail: string; finished: boolean }> = [];

  for (const c of candidates) {
    try {
      const report = await advancePreparation({
        userId: c.dealer_profile_id,
        sourceId: c.source_id,
        budgetMs: PER_RUN_BUDGET_MS,
      });
      advanced.push({ batchId: c.id, detail: report.detail, finished: report.finished });
    } catch (e) {
      // One dealer's failing run must not stop the tick for everyone else.
      advanced.push({
        batchId: c.id,
        detail: `error: ${e instanceof Error ? e.message : "unknown"}`,
        finished: false,
      });
    }
  }

  return NextResponse.json({ ok: true, considered: candidates.length, advanced });
}
