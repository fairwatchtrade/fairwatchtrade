import { NextResponse, type NextRequest, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { applyOneSlice } from "@/lib/auction-operations/applySlice";
import { getRun, updateRun, verifyStoredPlan, isOneLiveRunConflict, type AuctionRun } from "@/lib/auction-operations/runStore";
import {
  isApplyWithheld,
  APPLY_WITHHELD_ERROR,
  planBoundApplyEnabled,
  APPLY_PLAN_BOUND_DISABLED_ERROR,
} from "@/lib/auction-operations/packetContract";

/* ════════════════════════════════════════════════════════════════════════
   POST /api/admin/auctions/results/apply — explicit, bounded, resumable

   THE ONLY DOOR FROM A PLAN TO THE EVIDENCE LAYER, and it opens on three
   conditions, all server-verified:
     1. the run holds a plan and carries no contradictions;
     2. the founder posted the EXACT planSha256 they reviewed — approval is
        of a hash, and the hash is bound to server-held bytes;
     3. those stored bytes still hash to that value (verifyStoredPlan).
   Browser-supplied plan facts are never read. There is no force flag.

   Execution is bounded idempotent slices through the shared adapter
   engines (every result row still travels through
   auction_evidence_create_or_correct_result — nothing here writes one).
   Progress is durable after every slice: an interruption leaves a truthful
   'applying' run that this same route RESUMES — posting again with the
   same hash continues exactly where the cursor stopped. after() squeezes
   further slices into the invocation after the response is sent, so the
   normal case finishes hands-off while the room polls the run.

   TWO INDEPENDENT GATES, same shape as the admin status route.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";
export const maxDuration = 300;

// Defense-in-depth: hardcoded literal in THIS file, intentionally independent
// of the page's check and of any shared constant.
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

/** Wall-clock budget for the slices run BEFORE the response; after() gets
    the rest of the invocation window. Held back from maxDuration so the
    response is always sent. */
const RESPONSE_BUDGET_MS = 25_000;
const AFTER_BUDGET_MS = 240_000;
const SLICE_DEADLINE_MS = 20_000;

async function runSlices(
  service: ReturnType<typeof createServiceClient>,
  run: AuctionRun,
  plan: unknown,
  budgetMs: number
): Promise<{ state: string; progress: Record<string, unknown> }> {
  const deadline = Date.now() + budgetMs;
  let current = run;
  for (;;) {
    const outcome = await applyOneSlice(service, current, plan, SLICE_DEADLINE_MS);
    if (outcome.done) {
      await updateRun(service, current.id, {
        state: "applied",
        progress: outcome.progress,
        applied_at: new Date().toISOString(),
      });
      return { state: "applied", progress: outcome.progress };
    }
    await updateRun(service, current.id, { state: "applying", progress: outcome.progress });
    current = { ...current, progress: outcome.progress } as AuctionRun;
    if (Date.now() + SLICE_DEADLINE_MS > deadline) {
      return { state: "applying", progress: outcome.progress };
    }
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "not_authenticated", detail: "Sign in required." },
      { status: 401 }
    );
  }
  if (user.id !== ADMIN_USER_ID) {
    return NextResponse.json({ error: "forbidden", detail: "Admin only." }, { status: 403 });
  }

  let body: { runId?: unknown; planSha256?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request", detail: "Could not parse body." }, { status: 400 });
  }
  const runId = typeof body.runId === "string" ? body.runId : "";
  const approvedSha = typeof body.planSha256 === "string" ? body.planSha256.toLowerCase() : "";
  if (!runId || !approvedSha) {
    return NextResponse.json(
      { error: "bad_request", detail: "runId and the reviewed planSha256 are both required." },
      { status: 400 }
    );
  }

  let service;
  try {
    service = createServiceClient();
  } catch (e) {
    console.error("[auction-ops] apply — trusted client unavailable:", e);
    return NextResponse.json(
      { error: "server_misconfigured", detail: "Admin write channel unavailable." },
      { status: 500 }
    );
  }

  const run = await getRun(service, runId);
  if (!run) {
    return NextResponse.json({ error: "not_found", detail: "No such run." }, { status: 404 });
  }
  if (run.state === "applied") {
    return NextResponse.json(
      { runId: run.id, state: "applied", progress: run.progress },
      { status: 200 }
    );
  }
  if (run.state !== "planned" && run.state !== "applying") {
    return NextResponse.json(
      { error: "invalid_state", detail: `A ${run.state} run cannot be applied.` },
      { status: 409 }
    );
  }
  /* A plan-only family is refused HERE, before the run's state moves and
     before the hash is even compared. The dispatcher refuses it again
     underneath; this earlier refusal keeps the run truthfully 'planned'
     rather than leaving a 'failed' scar for asking a question the room
     should not have offered. */
  if (isApplyWithheld(run.adapter_id)) {
    return NextResponse.json(
      {
        error: APPLY_WITHHELD_ERROR,
        detail: `${run.adapter_id} is a plan-only family. Its plan may be reviewed; no writer exists and Apply is deliberately withheld.`,
      },
      { status: 409 }
    );
  }
  if (Array.isArray(run.contradictions) && run.contradictions.length > 0) {
    return NextResponse.json(
      { error: "apply_contradiction", detail: "This plan carries contradictions — it cannot be applied." },
      { status: 409 }
    );
  }
  if (run.plan_sha256 !== approvedSha) {
    return NextResponse.json(
      {
        error: "plan_hash_mismatch",
        detail: "The approved hash is not the server-held plan. Review the current plan and approve that.",
      },
      { status: 409 }
    );
  }

  let plan: unknown;
  try {
    ({ plan } = verifyStoredPlan(run));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[auction-ops] stored plan failed verification:", detail);
    return NextResponse.json({ error: "plan_hash_mismatch", detail }, { status: 409 });
  }

  /* THE PLAN-BOUND GATE (v8.25). The verified bytes the founder reviewed
     state whether this plan may execute. A plan generated while its family
     was plan-only says no in its own hash, and the family being released
     later is not authority to run it. Refused HERE, before the run's state
     moves, so a historical plan stays truthfully `planned` as history —
     never `failed`, never mutated, never retired to hide the question. */
  const bound = planBoundApplyEnabled(run.adapter_id, plan);
  if (!bound.enabled) {
    return NextResponse.json(
      {
        error: APPLY_PLAN_BOUND_DISABLED_ERROR,
        detail: `This plan's own reviewed bytes say Apply is not enabled (${bound.reason}). It stays planned as history. Generate a fresh plan under the released code and review that new hash.`,
      },
      { status: 409 }
    );
  }

  if (run.state === "planned") {
    /* planned -> applying enters the one-live-run index (migration
       20260902220000). A planned run is deliberately allowed to coexist with
       a newer planning run for the same revision, so this transition can be
       refused by the database while that other run is live. That refusal is
       the invariant working, not a fault: leave this plan exactly as it is,
       touch nothing about the other run, and tell the founder to retry once
       the other run leaves uploading/planning/applying. */
    try {
      await updateRun(service, run.id, { state: "applying", approved_at: new Date().toISOString() });
    } catch (e) {
      if (isOneLiveRunConflict(e)) {
        return NextResponse.json(
          {
            error: "active_run_conflict",
            detail:
              "Another run for this exact packet revision is currently uploading, planning or applying. This plan is unchanged; retry Apply once that run finishes.",
          },
          { status: 409 }
        );
      }
      throw e;
    }
  }

  try {
    const result = await runSlices(service, run, plan, RESPONSE_BUDGET_MS);

    if (result.state === "applying") {
      /* Continue after the response inside this same invocation — the same
         slice function, the same durable progress. If the window closes
         first, the run stays truthfully 'applying' and the next POST (the
         polling room, or the founder pressing Apply again) resumes it. */
      after(async () => {
        try {
          const fresh = await getRun(service, run.id);
          if (fresh && fresh.state === "applying") {
            await runSlices(service, fresh, plan, AFTER_BUDGET_MS);
          }
        } catch (e) {
          console.error("[auction-ops] apply continuation stopped:", e);
        }
      });
    }

    return NextResponse.json(
      { runId: run.id, state: result.state, progress: result.progress },
      { status: 200 }
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[auction-ops] apply refused:", detail);
    /* A contradiction mid-apply stops the run loudly. Completed slices are
       durable and idempotent; nothing is rolled back, nothing is faked.

       The writers throw `code: detail`. The code is kept as the run's
       last_error_code when it is a bounded snake_case word — a
       keeper_object_conflict is not the same finding as a lot_contradiction,
       and flattening both to one word is what hid the Sale 38 basis drift
       behind "existing result differs" for a day. Anything else stays
       apply_contradiction. */
    const named = /^([a-z][a-z0-9_]{2,63}):/.exec(detail);
    const code = named ? named[1] : "apply_contradiction";
    await updateRun(service, run.id, {
      state: "failed",
      last_error_code: code,
      last_error_detail: detail.slice(0, 4000),
    });
    return NextResponse.json({ error: code, detail }, { status: 422 });
  }
}
