/* ════════════════════════════════════════════════════════════════════════
   CURATION REVIEW — the collector-facing shape of a governed listing review

   A signed-in collector may ask FairWatchTrade to double-check a live
   listing. The same governed integrity providers run; this module decides
   what a collector is allowed to be told about the result.

   ── THE PRESENTATION BOUNDARY IS THE WHOLE POINT ───────────────────────
   Raw provider rows carry scores, matched source URLs, distances, model
   reasoning and founder-only evidence. None of that becomes public. This
   composer reduces a pass to three plain verdicts and one short sentence,
   and the public listing reads ONLY what this produced.

   The vocabulary is closed, by founder ruling:
     · Consistent
     · Needs clarification
     · Could not be independently resolved
   There is no fraud score, no confidence number, no accusation, and no
   certification. "Could not be independently resolved" is an honest and
   frequently correct answer — never force a category to read Consistent
   merely to fill the card.

   ── A REQUEST IS NOT EVIDENCE ──────────────────────────────────────────
   That a collector asked says nothing about the watch or the seller, and
   nothing here may imply otherwise. A clean result is SHORT.
   ════════════════════════════════════════════════════════════════════════ */

/** The only verdicts a collector ever sees. */
export const CURATION_VERDICTS = [
  "Consistent",
  "Needs clarification",
  "Could not be independently resolved",
] as const;
export type CurationVerdict = (typeof CURATION_VERDICTS)[number];

/** The three categories the V1 card reports, in render order. */
export type CurationSummary = {
  version: 1;
  categories: { label: string; verdict: CurationVerdict }[];
  comments: string;
  updated: string;
};

/** One provider row, reduced to only what the composer may consider. The
    narrow shape is deliberate: a wider input invites leakage later. */
export type ProviderOutcome = {
  provider: string;
  classification: string | null;
  execution_status: string;
  is_active: boolean;
  category: string | null;
};

const PROVIDER_AUTHENTICITY = "image_authenticity";
const PROVIDER_EXACT_HASH = "aubrey_exact_hash";
const PROVIDER_IDENTITY = "identity_consistency";

/** Current, active, completed attempts only — the same is_active rule the
    Founder Review coverage summaries use. A deactivated or failed attempt is
    not a current answer. */
function currentOf(rows: ProviderOutcome[], provider: string): ProviderOutcome[] {
  return rows.filter(
    (r) =>
      r.provider === provider && r.execution_status === "completed" && r.is_active === true
  );
}

/** A category with no completed attempt cannot be called clean. Silence is
    reported as silence. */
function verdictFor(rows: ProviderOutcome[]): CurationVerdict {
  if (rows.length === 0) return "Could not be independently resolved";
  return rows.some((r) => r.classification && r.classification !== "passed")
    ? "Needs clarification"
    : "Consistent";
}

/**
 * Compose the public Curation Review from a completed provider pass.
 *
 * `listingFactsResolved` is the listing-details category: V1 has no provider
 * that adjudicates seller-entered facts, so it is honest about that rather
 * than inventing a verdict.
 */
export function composeCurationSummary(params: {
  outcomes: ProviderOutcome[];
  /** ISO timestamp for the Updated line. */
  updated: string;
}): CurationSummary {
  const { outcomes, updated } = params;

  /* Listing details: the exact-hash provider is the only one that speaks to
     whether this listing's own material has appeared elsewhere on
     FairWatchTrade, which is the closest V1 has to a listing-level fact
     check. Absent it, the honest answer is that it was not resolved. */
  const details = verdictFor(currentOf(outcomes, PROVIDER_EXACT_HASH));
  const photographs = verdictFor(currentOf(outcomes, PROVIDER_AUTHENTICITY));
  const identity = verdictFor(currentOf(outcomes, PROVIDER_IDENTITY));

  const categories = [
    { label: "Listing details", verdict: details },
    { label: "Photographs", verdict: photographs },
    { label: "Reference / identity", verdict: identity },
  ];

  return {
    version: 1,
    categories,
    comments: composeComments(categories),
    updated,
  };
}

/** Calm, factual, proportional — and short when there is nothing to say. */
function composeComments(categories: { label: string; verdict: CurationVerdict }[]): string {
  const flagged = categories.filter((c) => c.verdict === "Needs clarification");
  const unresolved = categories.filter(
    (c) => c.verdict === "Could not be independently resolved"
  );

  if (flagged.length > 0) {
    const names = flagged.map((c) => c.label.toLowerCase()).join(" and ");
    return `This review found something worth a closer look under ${names}. FairWatchTrade has recorded it for review; it is not a finding against the seller.`;
  }
  if (unresolved.length === categories.length) {
    return "This review could not independently resolve any category from the material available. Nothing adverse was found.";
  }
  if (unresolved.length > 0) {
    const names = unresolved.map((c) => c.label.toLowerCase()).join(" and ");
    return `Nothing inconsistent was found. FairWatchTrade could not independently resolve ${names} from the material available.`;
  }
  return "Nothing inconsistent was found between this listing's details, its photographs and the reference it claims.";
}

/** Notification copy. Uses the real listing code where one exists. */
export function curationCompleteMessage(publicCode: string | null): string {
  const label = publicCode ? publicCode.toUpperCase() : "your saved listing";
  return `Your review of ${label} is complete. View the listing.`;
}
