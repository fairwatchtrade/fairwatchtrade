/* ════════════════════════════════════════════════════════════════════════
   lib/listingDeleteEligibility.ts — one vocabulary for "may this listing be
   permanently deleted yet?"

   The ANSWER is computed once, server-side, by
   public.listing_delete_eligibility(). This module does not decide anything:
   it types that answer and turns blocker CODES into sentences. Seller and
   admin both read it, which is the whole reason it exists — two surfaces
   explaining the same refusal in different words would be two different
   products.

   ⚠ NOTHING HERE MAY BECOME A SECOND OPINION. If a future surface needs a
   new blocker, it is added to the SQL function and its code lands here for
   wording. A blocker evaluated in TypeScript would be a rule the database
   does not enforce, and the client is not the gate.

   ⚠ AN ANSWER IS A SNAPSHOT, NOT A PERMISSION. eligible === true means
   "currently eligible" and nothing more. Purchase Requests, transactions and
   workflow state can all change immediately afterwards. The future purge
   stage must re-evaluate the same rules inside its own destructive
   transaction and lock; it may never trust a result obtained here.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type DeleteBlocker = {
  code: string;
  /** Present on not_removed — the state the listing is actually in. */
  current_status?: string;
  /** Present on the counting blockers. */
  count?: number;
  /** Present on active_transaction — the live states found. */
  states?: string | null;
};

export type DeleteEligibility = {
  listing_id: string;
  public_code: string | null;
  lifecycle_state: string;
  removal_reason_code: string | null;
  eligible_for_permanent_delete: boolean;
  blockers: DeleteBlocker[];
  evaluated_at: string;
};

/* Seller-facing wording. Plain, specific, and never naming machinery the
   seller has no way to act on. Each sentence answers "what is still
   unresolved", because that is the only question a blocked seller has. */
export function blockerSentence(b: DeleteBlocker): string {
  switch (b.code) {
    case "not_removed":
      return `This listing is still ${b.current_status ?? "active"}. Only a listing you've taken off the market can be permanently deleted.`;

    case "accepted_purchase_request":
      return b.count && b.count > 1
        ? `${b.count} accepted purchase requests are still active.`
        : "An accepted purchase request is still active.";

    case "pending_purchase_request":
      return b.count && b.count > 1
        ? `${b.count} purchase requests are still waiting for an answer.`
        : "A purchase request is still waiting for an answer.";

    case "active_transaction":
      return b.count && b.count > 1
        ? `${b.count} transactions connected to this listing are still active.`
        : "A transaction connected to this listing is still active.";

    case "active_wizard_session":
      return "A guided photo session for this listing is still in progress.";

    /* A code this build does not know about is still a real refusal. Say so
       honestly rather than dropping it — a blocker rendered as nothing would
       read as an all-clear, which is the one wrong answer this surface can
       give. */
    default:
      return `This listing is still blocked (${b.code}).`;
  }
}

/* Founder-facing wording — same truth, diagnostic register, and it prints the
   raw code so the admin surface can be read against the database directly. */
export function blockerAdminLine(b: DeleteBlocker): string {
  const bits: string[] = [b.code];
  if (b.current_status) bits.push(`status=${b.current_status}`);
  if (typeof b.count === "number") bits.push(`count=${b.count}`);
  if (b.states) bits.push(`states=${b.states}`);
  return bits.join(" · ");
}

/** True only for a listing this build would offer a Delete control on. The
    server decides eligibility; this decides whether asking is even sensible. */
export function canAskAboutDeletion(status: string): boolean {
  return status === "removed";
}
