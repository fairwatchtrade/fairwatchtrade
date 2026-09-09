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
    const base = `This review found something worth a closer look under ${names}. FairWatchTrade has recorded it for review; it is not a finding against the seller.`;
    return unresolved.length > 0
      ? `${base} ${UNRESOLVED_ALSO_SENTENCE}`
      : base;
  }
  if (unresolved.length === categories.length) {
    return ALL_UNRESOLVED_SENTENCE;
  }
  if (unresolved.length > 0) {
    return MIXED_SUMMARY_SENTENCE;
  }
  return CLEAN_SUMMARY_SENTENCE;
}

/* ════════════════════════════════════════════════════════════════════════
   PUBLIC DISPLAY MAPPING — Robots Readiness GRS-004 / GRS-010 (2026-09-09)

   THE MISCONCEPTION THIS SECTION EXISTS TO KILL:

     "The stored `comments` string is the review's summary."

   It is not. The stored VERDICTS are the review's truth; the sentence is
   presentation, and a sentence frozen at request time can contradict the
   verdicts beside it. The reproduction case was a mixed record — one
   category "Could not be independently resolved", two "Consistent" — whose
   stored sentence opened "Nothing inconsistent was found." A reader took
   the opening as an all-clear and the unresolved row as a footnote. The
   evidence was right; the explanation was wrong.

   So the public panel no longer prints the stored sentence. It derives the
   summary from the stored verdicts at read time through ONE mapper, here,
   which the composer above also uses for new records. Nothing stored is
   rewritten: the same three verdicts that were true yesterday produce a
   truthful sentence today.

   The mapping, from the verdicts alone:
     · every category Consistent            → clean, scoped to the three
                                               categories that completed
     · any Needs clarification              → concern leads; if anything is
                                               also unresolved, that is said
     · every category unresolved            → unresolved; no favourable
                                               clause is drawn from silence
     · some Consistent + some unresolved,
       nothing flagged                       → the locked mixed sentence
     · a verdict outside the closed
       vocabulary, or no categories at all  → unreadable; no conclusion

   There is deliberately no "not applicable" branch. The V1 composer has no
   producer state for it: a provider that did not run is "Could not be
   independently resolved", never "not applicable". Inventing that
   distinction in a mapper would be manufacturing a review state the
   producer never recorded.
   ════════════════════════════════════════════════════════════════════════ */

/** Locked (Layout order 2026-09-09) — mixed state: some completed, some not. */
export const MIXED_SUMMARY_SENTENCE =
  "Some checks completed, but parts of this review remain unresolved. See the findings below.";

/** Preserved clean sentence — allowed ONLY when every category completed
    Consistent, which the mapper proves before choosing it. It is scoped to
    the three categories it names, not to the watch. */
export const CLEAN_SUMMARY_SENTENCE =
  "Nothing inconsistent was found between this listing's details, its photographs and the reference it claims.";

/** All unresolved. The former trailing "Nothing adverse was found." is
    gone: nothing completed, so nothing favourable may be drawn. */
export const ALL_UNRESOLVED_SENTENCE =
  "This review could not independently resolve any category from the material available.";

/** Appended to a concern when other categories are unresolved, so the
    concern does not silently absorb them. Derived from the locked mixed
    sentence, not new promise language. */
export const UNRESOLVED_ALSO_SENTENCE =
  "Parts of this review also remain unresolved. See the findings below.";

/** Shown when a stored record cannot be read into the closed vocabulary.
    Absent or unreadable review data is not a pass. */
export const UNREADABLE_REVIEW_SENTENCE =
  "This review record could not be read. No conclusion is drawn from it.";

/** Locked short explanation (Layout order 2026-09-09 §3). Its last sentence
    is only true because this mapper now exposes limits and unresolved
    findings in the same panel. */
export const REVIEW_SCOPE_EXPLANATION =
  "Listing review considers the information and photographs submitted. It is not a physical inspection or authenticity certification. Any recorded limits or unresolved findings are shown with the review.";

export type CurationDisplayKind = "clean" | "concern" | "unresolved" | "mixed" | "unreadable";

export type CurationDisplay = {
  kind: CurationDisplayKind;
  /** The summary sentence, rendered ABOVE the findings. */
  lead: string;
  /** The findings, verbatim from the record when readable. */
  findings: { label: string; verdict: CurationVerdict }[];
  /** True only when every finding completed without concern or unresolved
      condition — the one state that may read as an all-clear, and even
      then only within the named categories. */
  allCompletedClean: boolean;
};

function isVerdict(v: unknown): v is CurationVerdict {
  return typeof v === "string" && (CURATION_VERDICTS as readonly string[]).includes(v);
}

/**
 * Derive the public display from a stored summary. Pure; reads verdicts
 * only; never trusts the stored sentence. Tolerates a null, legacy or
 * malformed record by refusing to conclude anything from it.
 */
export function curationDisplay(summary: CurationSummary | null | undefined): CurationDisplay {
  const raw = summary && Array.isArray(summary.categories) ? summary.categories : null;
  if (!raw || raw.length === 0) {
    return { kind: "unreadable", lead: UNREADABLE_REVIEW_SENTENCE, findings: [], allCompletedClean: false };
  }
  const findings: { label: string; verdict: CurationVerdict }[] = [];
  for (const c of raw) {
    if (!c || typeof c.label !== "string" || !isVerdict(c.verdict)) {
      return { kind: "unreadable", lead: UNREADABLE_REVIEW_SENTENCE, findings: [], allCompletedClean: false };
    }
    findings.push({ label: c.label, verdict: c.verdict });
  }
  const flagged = findings.filter((c) => c.verdict === "Needs clarification");
  const unresolved = findings.filter((c) => c.verdict === "Could not be independently resolved");
  const completed = findings.filter((c) => c.verdict === "Consistent");

  if (flagged.length > 0) {
    return { kind: "concern", lead: composeComments(findings), findings, allCompletedClean: false };
  }
  if (unresolved.length === findings.length) {
    return { kind: "unresolved", lead: ALL_UNRESOLVED_SENTENCE, findings, allCompletedClean: false };
  }
  if (unresolved.length > 0 && completed.length > 0) {
    return { kind: "mixed", lead: MIXED_SUMMARY_SENTENCE, findings, allCompletedClean: false };
  }
  return { kind: "clean", lead: CLEAN_SUMMARY_SENTENCE, findings, allCompletedClean: true };
}

/** Notification copy. Uses the real listing code where one exists. */
export function curationCompleteMessage(publicCode: string | null): string {
  const label = publicCode ? publicCode.toUpperCase() : "your saved listing";
  return `Your review of ${label} is complete. View the listing.`;
}
