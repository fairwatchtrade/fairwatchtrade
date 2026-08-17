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

   ── Authentication, and why the secret is not in this process ─────────
   No user session exists on a scheduled call. The gate is a bearer token
   that the DATABASE issued and still holds: this route never reads the
   secret, it asks whether the presented token matches one, and gets back a
   boolean. So the credential is absent from application memory, from the
   build, and from any log this route could write.

   It fails CLOSED in every direction — a missing token, an unconfigured
   credential, or an error reaching the validator all refuse. An open worker
   would let anyone drive other people's imports.

   This also means there is no environment variable for anyone to set. The
   scheduler and the validator were provisioned together in the migration,
   so unattended preparation works as soon as this code is deployed.

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

export async function POST(request: NextRequest) {
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (provided === "") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createServiceClient();

  // The comparison happens inside the database, against a secret this
  // process never sees. An error here is a refusal, not a bypass.
  const { data: valid, error: authError } = await db.rpc(
    "dealer_accelerator_worker_token_valid",
    { p_token: provided }
  );
  if (authError) {
    return NextResponse.json({ error: "worker_auth_unavailable" }, { status: 503 });
  }
  if (valid !== true) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

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
