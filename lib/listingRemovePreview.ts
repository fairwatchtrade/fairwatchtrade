/* ════════════════════════════════════════════════════════════════════════
   lib/listingRemovePreview.ts — what removing this listing will actually do

   Sibling to lib/listingDeleteEligibility.ts, and the same law applies: the
   ANSWER is computed once, server-side, by public.listing_remove_preview().
   This module does not decide anything. It types that answer and turns it
   into the sentences a founder reads before confirming.

   ⚠ NOTHING HERE MAY BECOME A SECOND OPINION. The room and the Assistant
   both render THIS, from the same function call, so the consequence the
   founder confirms and the consequence the Assistant states cannot differ.
   Before v6.89 the room previewed Remove by filtering on status in
   TypeScript and never mentioned the buyers whose requests were about to be
   cancelled — a confirmation that omitted its own cost.

   ⚠ AN ANSWER IS A SNAPSHOT. Counts can change between preview and execute.
   The governed RPC re-reads and re-locks inside its own transaction and is
   the only authority at execute time; nothing here is a permission.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type RemovePreview = {
  listing_id: string;
  public_code: string | null;
  brand: string | null;
  model: string | null;
  reference: string | null;
  current_status: string;
  removable: boolean;
  /** Present only when removable is false. */
  refusal: string | null;
  /** Pending purchase requests this removal will cancel. */
  requests_to_cancel: number;
  /** Distinct buyers who will be told. */
  buyers_notified: number;
  /** Accepted requests are NOT cancelled by a removal — they survive it. */
  accepted_requests_remaining: number;
  reversible: boolean;
  restore_target_status: string;
  restore_reopens_requests: boolean;
  evaluated_at: string;
};

/* Why this listing cannot be taken off the market. Same register as the
   delete blockers: specific, and never naming machinery the reader cannot
   act on. */
export function removeRefusalSentence(p: RemovePreview): string {
  switch (p.refusal) {
    case "already_removed":
      return "This listing is already off the market.";
    case "never_on_market":
      return `This listing is a ${p.current_status} — it was never on the market, so there is nothing to take it off.`;
    case "private_listing_machinery":
      return "This is a private listing. It is operated by the private listing machinery, not from this room.";
    default:
      return `This listing cannot be taken off the market from its current state (${p.current_status}).`;
  }
}

/* The consequence lines, in the order a founder needs them: what happens to
   other people first, then what this costs to undo. Every line is a fact
   from the server's own count — there is no "may affect" language here,
   because a confirmation that hedges is a confirmation that did not inform. */
export function removeConsequenceLines(p: RemovePreview): string[] {
  const lines: string[] = [];

  lines.push(
    p.requests_to_cancel === 0
      ? "No purchase requests are pending, so none will be cancelled."
      : p.requests_to_cancel === 1
        ? "1 pending purchase request will be cancelled."
        : `${p.requests_to_cancel} pending purchase requests will be cancelled.`
  );

  if (p.buyers_notified > 0) {
    lines.push(
      p.buyers_notified === 1
        ? "1 buyer will be notified that it came off the market."
        : `${p.buyers_notified} buyers will be notified that it came off the market.`
    );
  } else {
    lines.push("No buyer will be notified — there is nobody waiting on it.");
  }

  if (p.accepted_requests_remaining > 0) {
    lines.push(
      `${p.accepted_requests_remaining} accepted request${
        p.accepted_requests_remaining === 1 ? "" : "s"
      } will NOT be cancelled — an accepted request is a live obligation and survives the removal.`
    );
  }

  lines.push(
    `This is reversible: Restore puts it back into ${p.restore_target_status.replace(
      /_/g,
      " "
    )} for your approval. It does not return to Browse without one.`
  );

  if (!p.restore_reopens_requests && p.requests_to_cancel > 0) {
    lines.push(
      "Restoring later will NOT reopen those cancelled requests — the buyers would have to ask again."
    );
  }

  return lines;
}
