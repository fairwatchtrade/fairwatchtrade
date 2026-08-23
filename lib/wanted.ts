/* ════════════════════════════════════════════════════════════════════════
   WANTED / LOOKING FOR — shared truth — lib/wanted.ts

   Pure functions and vocabulary. No React, no I/O, no service imports, so
   both the collector workspace and the seller queue read the same rules and
   cannot drift apart.

   ── THE ONE LAW THAT LIVES HERE ────────────────────────────────────────
   The collector's exact target and ceiling are REQUESTER-PRIVATE matching
   inputs. This module holds the only place a budget becomes seller-visible,
   and it becomes exactly one of three words. There is deliberately no
   numeric, percentage, or bucket-index variant — a number the seller can
   read is a number the seller can anchor against, which is the exact
   inversion of negotiation leverage the founder ruling forbids.

   The database enforces the same law independently (sellers hold no row
   access to wanted_requests; wanted_requests_for_seller() is the only
   projection). This module is the second, application-side statement of it
   — used for the answer-time comparison, where the seller has already
   chosen a listing and the server computes the verdict.

   Pinned by scripts/wanted.test.mjs.
   ════════════════════════════════════════════════════════════════════════ */

export const WANTED_STATUSES = ["draft", "active", "answered", "paused", "closed"] as const;
export type WantedStatus = (typeof WANTED_STATUSES)[number];

export const ANSWER_STATES = ["unread", "viewed", "declined", "pursuing", "closed"] as const;
export type AnswerState = (typeof ANSWER_STATES)[number];

export const ANSWER_KINDS = ["existing_listing", "new_listing", "private_listing"] as const;
export type AnswerKind = (typeof ANSWER_KINDS)[number];

export const DOCUMENTATION_LEVELS = ["any", "papers", "full_set"] as const;
export type DocumentationLevel = (typeof DOCUMENTATION_LEVELS)[number];

export const DOCUMENTATION_LABELS: Record<DocumentationLevel, string> = {
  any: "Any",
  papers: "Papers required",
  full_set: "Full set required",
};

export const STATUS_LABELS: Record<WantedStatus, string> = {
  draft: "Draft",
  active: "Active",
  answered: "Answered",
  paused: "Paused",
  closed: "Closed",
};

export const CLOSE_REASONS = [
  { value: "bought_on_fwt", label: "Bought it on FairWatchTrade" },
  { value: "bought_elsewhere", label: "Bought it elsewhere" },
  { value: "no_longer_interested", label: "No longer looking" },
  { value: "other", label: "Other" },
] as const;

/* Condition vocabulary, ordered worst → best. A listing meets a request's
   minimum when its condition sits at or above the requested index. An
   unrecognised value on either side is UNKNOWN, never a silent pass. */
export const CONDITION_ORDER = [
  "For Parts / Not Working",
  "Poor",
  "Fair",
  "Good",
  "Very Good",
  "Excellent",
  "Mint",
  "Unworn",
  "New",
] as const;

export function conditionRank(value: string | null | undefined): number | null {
  if (!value) return null;
  const i = (CONDITION_ORDER as readonly string[]).findIndex(
    (c) => c.toLowerCase() === value.trim().toLowerCase()
  );
  return i === -1 ? null : i;
}

/* ── The budget signal — the whole seller-visible surface of a budget ──── */

export const BUDGET_FITS = ["within", "near", "outside"] as const;
export type BudgetFit = (typeof BUDGET_FITS)[number];

export const BUDGET_FIT_LABELS: Record<BudgetFit, string> = {
  within: "Within buyer range",
  near: "Near buyer range",
  outside: "Outside stated range",
};

/** How far above the ceiling still counts as "near". Deliberately wide:
    a narrow band would let a seller who re-prices repeatedly bisect their
    way toward the exact ceiling. Widening is safe; narrowing is not. */
export const NEAR_BAND = 0.15;

/** The ONLY conversion from money to something a seller may see. Returns
    null when there is nothing to compare — an absent signal is more honest
    than a manufactured one, and it leaks nothing. */
export function budgetFit(
  listingPrice: number | null | undefined,
  ceiling: number | null | undefined
): BudgetFit | null {
  if (listingPrice == null || ceiling == null || ceiling <= 0) return null;
  if (listingPrice <= ceiling) return "within";
  if (listingPrice <= ceiling * (1 + NEAR_BAND)) return "near";
  return "outside";
}

/* ── Identity ───────────────────────────────────────────────────────────
   The concise display string is generated from structured identity, never
   typed as prose. Missing parts are simply absent: no placeholder, no
   guessed reference. */
export function displayIdentity(input: {
  brand: string;
  modelText?: string | null;
  referenceText?: string | null;
}): string {
  const parts = [input.brand?.trim(), input.modelText?.trim(), input.referenceText?.trim()]
    .filter((p): p is string => !!p && p.length > 0);
  return parts.join(" · ");
}

/* ── Answer-time compatibility ──────────────────────────────────────────
   Truthful comparison of one governed listing against one request. An
   obvious contradiction must never masquerade as a full match, so every
   requirement lands in exactly one of met / failed / unknown — and
   "unknown" is reported as unknown rather than quietly counted as met. */

export type CriteriaReport = {
  requiredMet: string[];
  requiredFailed: string[];
  requiredUnknown: string[];
  preferredMet: string[];
  preferredMissing: string[];
  budgetFit: BudgetFit | null;
  /** True only when every requirement is affirmatively met. */
  meetsAllRequired: boolean;
};

export type WantedCriteria = {
  minCondition?: string | null;
  documentation: DocumentationLevel;
  mustHave: string[];
  preferred: string[];
  /** Requester-private — used here, never emitted into the report. */
  ceiling?: number | null;
  currency?: string | null;
};

export type ListingFacts = {
  condition?: string | null;
  /** Free-text haystack: description + included items + detail values. */
  text: string;
  hasPapers?: boolean | null;
  hasFullSet?: boolean | null;
  price?: number | null;
  currency?: string | null;
};

/** Case-insensitive substring presence. Criteria are short collector
    phrases ("white guilloché dial"), so substring is the honest test —
    but an empty phrase never counts as present. */
function mentions(haystack: string, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return false;
  return haystack.toLowerCase().includes(n);
}

export function compareListingToWanted(
  criteria: WantedCriteria,
  listing: ListingFacts
): CriteriaReport {
  const requiredMet: string[] = [];
  const requiredFailed: string[] = [];
  const requiredUnknown: string[] = [];

  // Condition floor
  if (criteria.minCondition) {
    const want = conditionRank(criteria.minCondition);
    const have = conditionRank(listing.condition);
    const label = `Condition at least ${criteria.minCondition}`;
    if (want == null || have == null) requiredUnknown.push(label);
    else if (have >= want) requiredMet.push(label);
    else requiredFailed.push(label);
  }

  // Documentation
  if (criteria.documentation !== "any") {
    const label = DOCUMENTATION_LABELS[criteria.documentation];
    const flag = criteria.documentation === "full_set" ? listing.hasFullSet : listing.hasPapers;
    if (flag == null) requiredUnknown.push(label);
    else if (flag) requiredMet.push(label);
    else requiredFailed.push(label);
  }

  // Must-have attributes
  for (const m of criteria.mustHave) {
    if (!m.trim()) continue;
    if (mentions(listing.text, m)) requiredMet.push(m);
    else requiredFailed.push(m);
  }

  const preferredMet: string[] = [];
  const preferredMissing: string[] = [];
  for (const p of criteria.preferred) {
    if (!p.trim()) continue;
    if (mentions(listing.text, p)) preferredMet.push(p);
    else preferredMissing.push(p);
  }

  /* Currency mismatch means the two prices are not comparable, so there is
     no honest fit to report. */
  const comparable =
    criteria.currency == null ||
    listing.currency == null ||
    criteria.currency === listing.currency;

  return {
    requiredMet,
    requiredFailed,
    requiredUnknown,
    preferredMet,
    preferredMissing,
    budgetFit: comparable ? budgetFit(listing.price, criteria.ceiling) : null,
    meetsAllRequired: requiredFailed.length === 0 && requiredUnknown.length === 0,
  };
}

/** One plain sentence for the seller before they send an answer. Names the
    contradiction rather than burying it. */
export function compatibilitySentence(report: CriteriaReport): string {
  if (report.requiredFailed.length > 0) {
    return `This listing does not meet ${report.requiredFailed.length} required criterion${
      report.requiredFailed.length === 1 ? "" : "s"
    }. The collector will see exactly which.`;
  }
  if (report.requiredUnknown.length > 0) {
    return `This listing meets the requirements that can be checked; ${report.requiredUnknown.length} could not be verified from the listing and will be shown as unconfirmed.`;
  }
  return "This listing meets every required criterion.";
}

/* ── Collector-facing status helpers ────────────────────────────────────── */

/** Which actions make sense in a given state. The workspace renders from
    this so a button can never appear where it would be meaningless. */
export function availableActions(status: WantedStatus): {
  canPause: boolean;
  canResume: boolean;
  canClose: boolean;
  canEdit: boolean;
  visibleToSellers: boolean;
} {
  return {
    canPause: status === "active" || status === "answered",
    canResume: status === "paused",
    canClose: status !== "closed",
    canEdit: status !== "closed",
    /* Paused stops seller visibility and routing while preserving history;
       closed and draft were never visible. */
    visibleToSellers: status === "active" || status === "answered",
  };
}

/** Age, in the room's voice. */
export function ageLabel(createdAt: string, now: number): string {
  const then = Date.parse(createdAt);
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((now - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

/* ── Browse hand-off ────────────────────────────────────────────────────
   The zero-result seam carries the collector's current criteria into the
   draft rather than making them type it again. Only parameters Wanted can
   honestly represent are carried; a sort order or a page size is not
   demand, so it is dropped rather than smuggled through. */
export function draftFromBrowseParams(params: URLSearchParams): {
  brand: string;
  modelText: string;
  referenceText: string;
  minCondition: string;
  mustHave: string[];
} {
  const brands = params.getAll("brand");
  const conditions = params.getAll("condition");
  const q = (params.get("q") ?? "").trim();
  return {
    /* One brand is a demand; three brands is a filter, and a Wanted request
       is for ONE watch — so a multi-brand search seeds no brand rather than
       an arbitrary one. */
    brand: brands.length === 1 ? brands[0] : "",
    modelText: q,
    referenceText: "",
    minCondition: conditions.length === 1 ? conditions[0] : "",
    mustHave: [],
  };
}

export function browseDraftHref(params: URLSearchParams): string {
  const seed = draftFromBrowseParams(params);
  const next = new URLSearchParams();
  if (seed.brand) next.set("brand", seed.brand);
  if (seed.modelText) next.set("model", seed.modelText);
  if (seed.minCondition) next.set("condition", seed.minCondition);
  next.set("new", "1");
  return `/wanted?${next.toString()}`;
}
