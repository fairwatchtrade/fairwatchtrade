import type { SupabaseClient } from "@supabase/supabase-js";
import { applyMonacoPlanSlice } from "@/scripts/monaco-legend-import.mjs";
import { applySalePlan } from "@/scripts/phillips-sale-import.mjs";
import type { AuctionRun } from "@/lib/auction-operations/runStore";
import { applyDispatchFor, APPLY_WITHHELD_ERROR, APPLY_UNSUPPORTED_ERROR } from "@/lib/auction-operations/packetContract";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — APPLY SLICE — lib/auction-operations/applySlice.ts

   One dispatcher over the adapter-specific bounded apply functions. Both
   Monaco packets share the identical cursor-resumable engine
   (applyMonacoPlanSlice — same predicates, same controlled RPC); Phillips
   reuses its proven applySalePlan with its stopAfter budget.

   NOTHING HERE WRITES A RESULT DIRECTLY. Every result row still travels
   through auction_evidence_create_or_correct_result inside the shared
   engines — this module only decides how big one bite is and reports
   truthful durable progress.

   ── THE FALL-THROUGH IS THE HAZARD ─────────────────────────────────────
   "Everything that is not Phillips is Monaco" was true when three adapters
   existed. It stops being true the moment a fourth appears, and it fails in
   the worst direction: a family with no writer would be handed the Monaco
   writer by default. So the decision is no longer made here by elimination.
   applyDispatchFor() in packetContract.ts decides, withheld comes first,
   and a withheld family throws by name before any engine is reached.
   ════════════════════════════════════════════════════════════════════════ */

export type SliceOutcome = {
  done: boolean;
  progress: Record<string, unknown>;
};

/** Rows per slice — small enough that a slice always fits its deadline,
    large enough that a full packet needs only a handful of slices. */
const SLICE_ROWS = 120;

export async function applyOneSlice(
  db: SupabaseClient,
  run: AuctionRun,
  plan: unknown,
  deadlineMs: number
): Promise<SliceOutcome> {
  const dispatch = applyDispatchFor(run.adapter_id);

  if (dispatch === "withheld") {
    /* Server-side, fail-closed, before any engine and before any write.
       The route refuses this earlier as well so the run never flips to
       'applying'; this is the backstop for any caller that is not the route. */
    throw new Error(
      `${APPLY_WITHHELD_ERROR}: ${run.adapter_id} is a plan-only family — no writer exists and Apply is deliberately withheld`
    );
  }

  if (dispatch === "unsupported") {
    /* A name that is neither withheld nor a proven writer family. Nothing is
       inherited by elimination; the door is closed by name before any engine. */
    throw new Error(
      `${APPLY_UNSUPPORTED_ERROR}: ${run.adapter_id} has no writer wired for Apply`
    );
  }

  if (dispatch === "phillips") {
    /* applySalePlan walks the plan from the top each call; already-applied
       rows are cheap idempotent reuses, so a growing stopAfter budget is a
       correct cursor for its 156-row scale. */
    const already = Number(run.progress.processed ?? 0);
    const outcome = await applySalePlan(plan, db, { stopAfter: already + SLICE_ROWS });
    const total = (plan as { lots: unknown[] }).lots.length;
    const processed = outcome.interrupted ? already + SLICE_ROWS : total;
    return {
      done: !outcome.interrupted,
      progress: {
        processed,
        total,
        lots_created: outcome.lotsCreated,
        lots_reused: outcome.lotsReused,
        results_created: outcome.resultsCreated,
        results_reused: outcome.resultsReused,
        last_lot: outcome.lastLot,
      },
    };
  }

  // dispatch === "monaco": the shared cursor-resumable engine for exactly the
  // two proven Monaco writing families, monaco-legend and monaco-layer2 —
  // reached only when applyDispatchFor named them. The portable writer
  // (monaco-portable-writer.mjs) is NOT wired here: its family is withheld,
  // and the release that lifts that must add its explicit branch.
  const prior = run.progress as {
    cursor?: { sale_index: number; row_index: number };
    counts?: Record<string, number>;
  };
  const outcome = await applyMonacoPlanSlice(plan, db, {
    cursor: prior.cursor,
    maxRows: SLICE_ROWS,
    deadlineMs,
  });
  const counts: Record<string, number> = { ...(prior.counts ?? {}) };
  for (const [k, v] of Object.entries(outcome.counts as Record<string, number>)) {
    counts[k] = (counts[k] ?? 0) + v;
  }
  const total = (plan as { sales: { rows: unknown[] }[] }).sales.reduce(
    (acc, s) => acc + s.rows.length,
    0
  );
  const processedRows = Object.values(counts).reduce((a, b) => a + b, 0) / 2; // lot+result per row
  return {
    done: outcome.done,
    progress: {
      cursor: outcome.cursor,
      counts,
      processed: Math.round(processedRows),
      total,
    },
  };
}
