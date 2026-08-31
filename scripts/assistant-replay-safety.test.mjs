/* Admin Assistant — Round G: correlation, replay safety, known-unknowns.

   The law being proven: a confirmation that reaches the product twice must
   not reach the WATCHES twice. The gate is a pure function precisely so this
   can be proven exhaustively without a database.

   Run: node scripts/assistant-replay-safety.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decideExecution,
  unreceiptedSentence,
  reconciledSentence,
  UNRECEIPTED_MARKER_LABEL,
} from "../lib/assistantOperations.ts";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };

const receipt = (id = "rcpt-1", n = 2) => ({
  id,
  created_at: "2026-08-30T10:00:00Z",
  succeeded_listing_ids: Array.from({ length: n }, (_, i) => `l${i}`),
});
const marker = (n = 2) => ({
  correlation_id: "corr-1",
  operation: "approve_listings",
  succeeded_listing_ids: Array.from({ length: n }, (_, i) => `l${i}`),
  executed_at: "2026-08-30T10:00:00Z",
  receipt_error: "insert timeout",
});

// ── First run executes ───────────────────────────────────────────────────
{
  const g = decideExecution({ existingReceipt: null, openMarker: null });
  ok("a clean first confirmation executes", g.state === "EXECUTE");
}

// ── A receipt means it already ran. Never again. ─────────────────────────
{
  const g = decideExecution({ existingReceipt: receipt(), openMarker: null });
  ok("an existing receipt refuses execution", g.state === "ALREADY_EXECUTED");
  ok("it names the receipt", g.receiptId === "rcpt-1");
  ok("it says it did not run again", /not run it again/i.test(g.sentence));
  ok("it does not claim the action failed", !/did not happen|failed/i.test(g.sentence));
}

// ── An open marker means it ran and the record is missing. Never again. ──
{
  const g = decideExecution({ existingReceipt: null, openMarker: marker() });
  ok("an open known-unknown refuses execution", g.state === "AWAITING_RECEIPT_RECONCILIATION");
  ok("it leads with the marker label", g.sentence.startsWith(UNRECEIPTED_MARKER_LABEL));
  ok("it states the operation already executed", /already executed/i.test(g.sentence));
  ok("it refuses to re-run for a receipt", /not running it again/i.test(g.sentence));
  ok("it commits to re-reading current state", /re-read current state/i.test(g.sentence));
  ok("it carries the marker forward", g.marker.correlation_id === "corr-1");
}

// ── Both present: the receipt is the stronger evidence, and either way
//    execution is refused. There is NO combination that executes twice. ──
{
  const g = decideExecution({ existingReceipt: receipt(), openMarker: marker() });
  ok("receipt outranks marker", g.state === "ALREADY_EXECUTED");
}
{
  // Exhaustive: only the empty-evidence case may ever execute.
  const cases = [
    [null, null, "EXECUTE"],
    [receipt(), null, "ALREADY_EXECUTED"],
    [null, marker(), "AWAITING_RECEIPT_RECONCILIATION"],
    [receipt(), marker(), "ALREADY_EXECUTED"],
  ];
  for (const [r, m, expected] of cases) {
    const g = decideExecution({ existingReceipt: r, openMarker: m });
    ok(`receipt=${!!r} marker=${!!m} → ${expected}`, g.state === expected);
  }
  const executable = cases.filter(([, , e]) => e === "EXECUTE");
  ok("exactly one of four evidence states may execute", executable.length === 1);
}

// A receipt recording zero successes still blocks re-execution: the
// operation ran, and "it achieved nothing" is not permission to run it again.
{
  const g = decideExecution({ existingReceipt: receipt("rcpt-empty", 0), openMarker: null });
  ok("a zero-success receipt still refuses execution", g.state === "ALREADY_EXECUTED");
}

// ── The founder-facing sentence must not imply nothing happened ──────────
{
  const s = unreceiptedSentence(3, 1);
  ok("marker sentence leads with the label", s.startsWith(UNRECEIPTED_MARKER_LABEL));
  ok("it states the change is done and not in doubt", /not in doubt/i.test(s));
  ok("it counts what changed", /3 listings were changed/.test(s));
  ok("it reports the failures too", /1 did not/.test(s));
  ok("it says only the record failed", /record/i.test(s));
  ok("it promises not to repeat the action", /will not repeat the action/i.test(s));
  ok("it never says the action failed", !/the action failed/i.test(s));

  const one = unreceiptedSentence(1, 0);
  ok("singular reads correctly", /1 listing was changed/.test(one));
  ok("no failures clause when none failed", !/did not,/.test(one));
}

// ── Reconciliation is evidence repair, never re-execution ────────────────
{
  const s = reconciledSentence("rcpt-9");
  ok("reconciliation names the receipt", s.includes("rcpt-9"));
  ok("reconciliation states nothing was executed again", /nothing was executed again/i.test(s));
  ok("reconciliation says only evidence was completed", /only the evidence/i.test(s));
}

// ── STRUCTURAL: the route cannot execute past the gate ───────────────────
{
  const route = readFileSync("app/api/admin/assistant/route.ts", "utf8");
  const confirmIdx = route.indexOf('action === "confirm"');
  ok("the confirm block exists", confirmIdx > 0);
  const confirmBlock = route.slice(confirmIdx);

  const gateIdx = confirmBlock.indexOf("decideExecution");
  const approveIdx = confirmBlock.indexOf("executeListingStatusTransition");
  const removeIdx = confirmBlock.indexOf('rpc("remove_listing_assistant"');
  ok("the replay gate runs inside confirm", gateIdx > 0);
  ok("the gate runs BEFORE the approve machinery", gateIdx < approveIdx);
  ok("the gate runs BEFORE the remove machinery", gateIdx < removeIdx);

  ok("both refusal states return before execution",
    confirmBlock.indexOf('gateDecision.state === "ALREADY_EXECUTED"') < approveIdx &&
    confirmBlock.indexOf('gateDecision.state === "AWAITING_RECEIPT_RECONCILIATION"') < approveIdx);

  // The retry path must re-read current governed state before repairing.
  const reconcileIdx = confirmBlock.indexOf('AWAITING_RECEIPT_RECONCILIATION"');
  const rereadIdx = confirmBlock.indexOf('.select("id, status")', reconcileIdx);
  const repairIdx = confirmBlock.indexOf("assistant_operation_receipts", reconcileIdx);
  ok("the retry path re-reads current state before writing the repair receipt",
    rereadIdx > reconcileIdx && rereadIdx < repairIdx);

  ok("the receipt carries the correlation id", /correlation_id: correlationId/.test(confirmBlock));
  ok("the correlation id is the confirmed plan id", /const correlationId = plan\.id/.test(confirmBlock));
  ok("a receipt failure with successes writes the marker",
    /assistant_unreceipted_operations[\s\S]{0,400}succeeded_listing_ids/.test(confirmBlock));
  ok("the marker is only written when something actually succeeded",
    /if \(succeeded\.length > 0\) \{[\s\S]{0,200}unreceipted = true/.test(confirmBlock));
}

console.log(`assistant-replay-safety: ${pass} assertions PASS`);
