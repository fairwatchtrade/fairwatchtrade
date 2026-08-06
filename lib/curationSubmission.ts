import type { ListingDraft } from "./listing.ts";
import type { ListingSubmission } from "./evaluationPrompt.ts";
import { parsePrice } from "./parsePrice.ts";
import { isSupportedCurrency } from "./supportedCurrencies.ts";
import { requirementProfileFor } from "./admission/requirementProfile.ts";
import { classifyRolexIdentifier } from "./admission/rolexIdentifier.ts";

/* ════════════════════════════════════════════════════════════════════════
   CURATION SUBMISSION — lib/curationSubmission.ts

   The single mapping from a seller's in-progress draft to the shape
   /api/evaluate actually reads.

   ── WHY THIS FILE EXISTS ───────────────────────────────────────────────
   Both clients hand-built the evaluate payload in camelCase:

       { brand, reference, year, condition, askingPrice, provenanceNote }

   while ListingSubmission — the contract buildEvaluationPrompt() reads —
   declares `asking_price` and `provenance`. The route casts the body
   (`const listing: ListingSubmission = await request.json()`), and a cast
   renames nothing at runtime, so BOTH fields arrived as undefined and the
   prompt rendered "Not provided" for them on every evaluation ever run.

   Two consequences, neither of which produced an error anywhere:
     · the seller's provenance note — the field a seller uses to explain
       unusual circumstances in their own words — was discarded before the
       model saw it;
     · "Price reasonableness (0-10 points)" was scored against a missing
       price for every listing.

   Nothing threw, so nothing surfaced. The prompt politely said "Not
   provided" and every layer behaved.

   ── WHY A SHARED MAPPER, NOT TWO RENAMES ───────────────────────────────
   Renaming the literals at both call sites would fix today and drift again
   the moment a third caller appears or a field is added. The return type is
   annotated `ListingSubmission`, so the compiler now checks the payload
   against the contract the prompt reads. A future rename on either side is
   a typecheck failure rather than another silent "Not provided".

   ── CANARY ─────────────────────────────────────────────────────────────
   Deliberately corrects the CLIENT side. app/api/evaluate/route.ts is the
   canary (PFC274 = 62) and lib/evaluationPrompt.ts holds the AI score band;
   neither is modified. The ListingSubmission type is IMPORTED from the
   prompt module, which reads the contract without altering it.
   ════════════════════════════════════════════════════════════════════════ */

/** Draft price text → a real number for scoring, via the SAME governed parser
 *  the publish path uses. Curation and publication therefore agree on what the
 *  price is; a bespoke parseFloat here could let the evaluator score one number
 *  while the listing carries another.
 *
 *  Returns undefined when the amount cannot be parsed with confidence — the
 *  prompt then renders "Not provided", which is the truthful answer. A guessed
 *  number would be worse than a missing one in a scoring dimension. */
function priceForEvaluation(draft: ListingDraft): number | undefined {
  const text = (draft.askingPrice ?? "").trim();
  if (!text) return undefined;
  const currency = (draft.askingCurrency ?? "").trim().toUpperCase();
  if (!isSupportedCurrency(currency)) return undefined;
  const parsed = parsePrice(text, currency);
  return parsed.ok ? parsed.amount : undefined;
}

/** Build the evaluate payload from a draft.
 *
 *  `provenance` carries the seller's own words. It is the field through which
 *  someone who cannot describe a watch in collector vocabulary — an inherited
 *  piece, an estate sale, a spouse selling a collection they did not build —
 *  explains their situation. It must reach the evaluator intact; that is the
 *  entire point of the field. */
/** The reference the EVALUATOR should see. For a profile brand whose entry is
 *  a recognized composite Style, the deterministically derived canonical
 *  reference is submitted — the evaluator judges watches, and the watch's
 *  public identity is the canonical reference, not Rolex's internal
 *  bracelet/dial coding. The raw Style is preserved separately in the draft's
 *  admission state; it is documentary evidence, not the evaluator's input.
 *  (Style-number ruling 2026-08-06. Canary: /api/evaluate and the prompt
 *  module remain untouched — this shapes only the client's payload.) */
function referenceForEvaluation(draft: ListingDraft): string | undefined {
  const raw = draft.reference.trim();
  if (!raw) return undefined;
  if (!requirementProfileFor(draft.brand)) return raw;
  const identifier = classifyRolexIdentifier(raw);
  return identifier.kind === "style" ? identifier.reference : raw;
}

export function buildCurationSubmission(draft: ListingDraft): ListingSubmission {
  return {
    brand: draft.brand,
    reference: referenceForEvaluation(draft),
    year: draft.year || undefined,
    condition: draft.condition || undefined,
    asking_price: priceForEvaluation(draft),
    provenance: draft.provenanceNote || undefined,
  };
}
