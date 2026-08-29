import type { ListingDraft } from "./listing.ts";
import type { ListingSubmission } from "./evaluationPrompt.ts";
import { parsePrice } from "./parsePrice.ts";
import { isSupportedCurrency } from "./supportedCurrencies.ts";
import { requirementProfileFor } from "./admission/requirementProfile.ts";
import { draftTudorAdmission } from "./admission/tudorReference.ts";
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
/** The identity the EVALUATOR should see, for a profile (Rolex) submission.
 *
 *  The evaluator must judge the EXACT watch, never the bare family — so a
 *  profile submission carries the model name, the canonical reference, and,
 *  when the seller entered a recognized composite Style, the complete
 *  documented Style code as exact-configuration evidence (it encodes dial
 *  and bracelet configuration beyond the reference). The canonical reference
 *  is what derives from the Style — the evaluator never receives Rolex's
 *  internal coding AS the reference. (Style-number ruling + admission-logic
 *  defect correction, 2026-08-06.)
 *
 *  Non-profile brands return null and their payload stays byte-for-byte what
 *  it always was — including the canary's. */
function profileIdentityForEvaluation(
  draft: ListingDraft
): Pick<ListingSubmission, "reference" | "model" | "style_number"> | null {
  const profile = requirementProfileFor(draft.brand, draftTudorAdmission(draft));
  if (!profile) return null;
  /* Tudor identity is canonical Vault truth — the reference travels as the
     seller entered it and never through the Rolex Style grammar, which
     encodes another marque's internal coding. Style numbers are a Rolex
     fact; for Tudor the field is simply absent. */
  if (profile.brand === "Tudor") {
    return {
      reference: (draft.reference ?? "").trim() || undefined,
      model: (draft.model ?? "").trim() || undefined,
      style_number: undefined,
    };
  }
  // Null-safe on purpose: live drafts always initialize these fields, but
  // this module must never crash on a partial draft (test fixtures, future
  // callers) — a missing field is "Not provided", not an exception.
  const raw = (draft.reference ?? "").trim();
  const identifier = raw ? classifyRolexIdentifier(raw) : null;
  return {
    reference:
      identifier?.kind === "style" ? identifier.reference : raw || undefined,
    model: (draft.model ?? "").trim() || undefined,
    style_number: identifier?.kind === "style" ? identifier.style : undefined,
  };
}

export function buildCurationSubmission(draft: ListingDraft): ListingSubmission {
  const profileIdentity = profileIdentityForEvaluation(draft);
  return {
    brand: draft.brand,
    reference: draft.reference || undefined,
    ...(profileIdentity ?? {}),
    year: draft.year || undefined,
    condition: draft.condition || undefined,
    asking_price: priceForEvaluation(draft),
    provenance: draft.provenanceNote || undefined,
  };
}
