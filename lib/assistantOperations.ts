/* ────────────────────────────────────────────────────────────────────────
   ASSISTANT OPERATIONS — correlation, replay safety, known-unknowns

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "There is no receipt, so the operation did not happen."

   A missing receipt proves nothing about the mutation. The governed action
   and the evidence of it are written in two steps, and the dangerous gap is
   the one where the first succeeded and the second did not. Reading "no
   receipt" as "did not happen" is what turns receipt repair into a second
   real product mutation.

   > Receipt repair may never become action replay by accident.

   The decision is a pure function so it can be proven exhaustively without a
   database: given what the product knows about this correlation id, may this
   operation execute at all?
   ──────────────────────────────────────────────────────────────────────── */

export const UNRECEIPTED_MARKER_LABEL = "ACTION HAPPENED — RECEIPT NOT YET RECORDED";

export type ExistingReceipt = {
  id: string;
  created_at: string;
  succeeded_listing_ids: string[];
} | null;

export type OpenMarker = {
  correlation_id: string;
  operation: string;
  succeeded_listing_ids: string[];
  executed_at: string;
  receipt_error: string | null;
} | null;

export type ExecutionGate =
  | { state: "EXECUTE" }
  | { state: "ALREADY_EXECUTED"; receiptId: string; sentence: string }
  | {
      state: "AWAITING_RECEIPT_RECONCILIATION";
      marker: NonNullable<OpenMarker>;
      sentence: string;
    };

/* The one gate every Assistant mutation passes through.

   Order is deliberate and load-bearing. A receipt is checked FIRST because a
   receipt is the strongest available evidence that the operation already
   completed end to end; only when there is none does an open known-unknown
   become the deciding fact. Both outcomes refuse execution. There is no
   branch that executes because evidence was merely ambiguous. */
export function decideExecution(input: {
  existingReceipt: ExistingReceipt;
  openMarker: OpenMarker;
}): ExecutionGate {
  const { existingReceipt, openMarker } = input;

  if (existingReceipt) {
    return {
      state: "ALREADY_EXECUTED",
      receiptId: existingReceipt.id,
      sentence:
        `This exact operation already ran and is on record (receipt ${existingReceipt.id}). ` +
        "I have not run it again — confirming twice must never mean acting twice. " +
        `${existingReceipt.succeeded_listing_ids.length} listing(s) succeeded at that time; ` +
        "ask me about them and I will re-read what they are now.",
    };
  }

  if (openMarker) {
    return {
      state: "AWAITING_RECEIPT_RECONCILIATION",
      marker: openMarker,
      sentence:
        `${UNRECEIPTED_MARKER_LABEL}. This operation already executed — ` +
        `${openMarker.succeeded_listing_ids.length} listing(s) succeeded — and only the record of it failed to save. ` +
        "I am not running it again to produce a receipt, because that would perform the action a second time. " +
        "I will re-read current state and try to write the missing record instead.",
    };
  }

  return { state: "EXECUTE" };
}

/* What the founder is told when a mutation succeeds and its receipt does
   not. It states the action happened FIRST, because the failure mode this
   language exists to prevent is a founder concluding from a missing receipt
   that nothing occurred. */
export function unreceiptedSentence(succeededCount: number, failedCount: number): string {
  const ran =
    succeededCount === 1
      ? "1 listing was changed"
      : `${succeededCount} listings were changed`;
  return (
    `${UNRECEIPTED_MARKER_LABEL}.\n` +
    `${ran} exactly as reported above — that part is done and is not in doubt. ` +
    (failedCount > 0 ? `${failedCount} did not, also as reported. ` : "") +
    "What failed is the write of the operation's own record. I have marked this as a known unknown " +
    "on your work so you do not have to remember it, and it stays visible until the record is " +
    "written or you decide to accept the gap. I will not repeat the action to produce a receipt."
  );
}

/* Reconciliation is a receipt write for an operation that already ran. It is
   never a re-execution, and this helper exists so the distinction is named
   in one place rather than implied at a call site. */
export function reconciledSentence(receiptId: string): string {
  return (
    `The missing record for that earlier operation has now been written (receipt ${receiptId}). ` +
    "Nothing was executed again — only the evidence was completed."
  );
}
