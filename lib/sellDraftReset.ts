import type { ListingDraft } from "./listing.ts";
import { watchIdentityChanged } from "./admission/requirementProfile.ts";

/* ────────────────────────────────────────────────────────────────────────
   IDENTITY-BOUND DRAFT STATE — what leaves when the watch changes.

   The governing principle, already stated in the Sell Flow before this
   module existed: stale identity-bound state silently filed under a
   different watch is worse than no state at all.

   Two kinds of state live in a listing draft. Most of it describes whatever
   watch is being described right now — dial colour stays true of the NEW
   watch until the seller says otherwise, so it survives. A smaller set is
   an answer ABOUT ONE PHYSICAL WATCH:

     · details.admission   — affirmations answering the admission corridor;
     · significanceScore   — Collector Significance, earned by one submission;
     · curationDecision    — whether THAT watch was admitted;
     · curationReasoning   — the message explaining that decision.

   All four leave together when the identity beneath them changes. The score
   travels with the decision deliberately: a cleared score beside a surviving
   "pass" is worse than either alone, because the flow gates on the decision
   and would carry an admission granted to a different watch.

   CLEARED, NEVER RECOMPUTED. The seller re-runs curation exactly as they did
   the first time. Nothing here re-evaluates on their behalf.

   `watchIdentityChanged` owns what "materially different" means — it trims
   and lowercases the brand and applies canonical-reference semantics, so a
   no-op reselect or a Style-to-canonical retype is not a change and clears
   nothing.

   Pure and total: same inputs, same output, no clock, no network, no React.
   That is what lets the ruling be tested rather than described.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Given the draft before a patch and the draft after it, return the draft
 * with any identity-bound state removed if the patch changed WHICH watch is
 * being described. Returns `next` untouched when the identity held, and
 * allocates nothing when there was nothing to clear.
 */
export function resetIdentityBoundState(
  prev: ListingDraft,
  next: ListingDraft
): ListingDraft {
  if (
    !watchIdentityChanged(
      { brand: prev.brand, reference: prev.reference },
      { brand: next.brand, reference: next.reference }
    )
  ) {
    return next;
  }

  let out = next;

  if (prev.details.admission !== undefined) {
    const details = { ...out.details };
    delete details.admission;
    out = { ...out, details };
  }

  if (prev.significanceScore !== null || prev.curationDecision !== "pending") {
    out = {
      ...out,
      significanceScore: null,
      curationDecision: "pending",
      curationReasoning: "",
    };
  }

  return out;
}
