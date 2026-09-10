/* ════════════════════════════════════════════════════════════════════════
   PUBLIC WATCH INDEX — the projection  (Phase 1, internal only)
   lib/publicWatchIndex/projection.ts

   Governing authority:
   docs/product-laws/Public_Watch_Index_Product_Contract_v2_ADOPTED.md

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "These four answers are four buckets, so one of them is the record's
      status."

   They are not buckets. They are FOUR INDEPENDENT ASSERTIONS about one
   reference, and none stands in for another (§3). A reference can have
   approved public knowledge, qualifying public listing history, a listing
   available right now, and admitted Market Evidence, all at once — or any
   subset. Collapsing them into one status is the failure the whole contract
   is written to prevent.

   THE SUBJECT IS THE CANONICAL REFERENCE (§2). One record describes one
   watch/reference identity — never a particular owner's physical watch and
   never a listing. `lib/identity/README.md` exists because conflating "what
   kind of watch is this" with "which physical object is this" destroys
   provenance; this projection stays entirely on the first question.

   THREE-VALUED, ALWAYS. Every assertion distinguishes an affirmative fact, a
   successful complete check that did not establish it, and a check that
   could not be completed (§3). A failed check is never rendered as a
   negative, and an empty partial page is never a definitive negative (§4).
   That is why nothing here returns a bare boolean.

   PURE. No database, no request, no framework. Every input is handed in, so
   the whole law is executable in the test with in-memory rows.

   Read lib/publicWatchIndex/README.md before changing a rule here.
   ════════════════════════════════════════════════════════════════════════ */

/** The contract version this projection implements. Not a route version. */
export const CONTRACT_VERSION = "public-watch-index/v2";

/* ── The four assertion vocabularies (§3) ───────────────────────────────── */

export type AvailabilityState =
  | "yes"
  | "no_current_qualifying_public_listings"
  | "availability_unavailable";

export type HistoryState =
  | "established"
  | "not_established_within_coverage"
  | "unavailable_or_incomplete";

export type KnowledgeState =
  | "approved_public_knowledge"
  | "none_established_within_coverage"
  | "unavailable_or_incomplete";

export type MarketEvidenceState =
  | "qualifying_record"
  | "none_established_within_coverage"
  | "unavailable_or_incomplete";

/** Which assertion a suppression covers. Mirrors the database CHECK. */
export type SuppressibleAssertion =
  | "all"
  | "available_now"
  | "public_listing_history"
  | "approved_public_reference_knowledge"
  | "market_evidence";

/* ── Inputs ─────────────────────────────────────────────────────────────── */

/** Public reference identity (§2). Hierarchy appears only where the identity
    supports it — never invented to make an entry look complete. */
export type ReferenceIdentity = {
  vaultReferenceId: string;
  manufacturer: string;
  reference: string;
  collection?: string | null;
  family?: string | null;
  variant?: string | null;
};

/** One listing admitted by the governed public-discovery boundary. The
    projection never re-derives eligibility from a status string (§4) — if it
    is in this array, the view admitted it. Seller identity is deliberately
    absent from this type: it must not exist to be leaked. */
export type EligibleListing = { listingId: string; canonicalUrl: string };

/** A durably evidenced public publication episode (§5 conditions 1 and 2). */
export type PublicationEpisode = {
  listingId: string;
  /** True only when a governed source supports the genuine public episode.
      Today's listing row is never this evidence. */
  durablyEvidenced: boolean;
  /** §5 condition 3, proven SEPARATELY from publication: that this episode
      belongs to the asserted canonical reference. Today's `vault_reference_id`,
      seller wording and mutable listing contents do not establish it. */
  referenceAssociationEvidenced: boolean;
  /** §5 condition 4: permitted for this public use. */
  publicUsePermitted: boolean;
  /** §5 condition 5: fixture, fabricated episode, or governed mistake code. */
  disqualifyingMistake: boolean;
};

/** A live suppression, reduced to what the projection is allowed to know.
    Actor, reason and time are recorded internally and never reach here. */
export type LiveSuppression = {
  assertion: SuppressibleAssertion;
  /** null = the whole reference's assertion. Non-null = this contribution,
      which the suppression follows across reassociation (§8). */
  contributionListingId: string | null;
};

export type ProjectionInput = {
  reference: ReferenceIdentity;
  /** null = the current public population could not be checked completely. */
  eligibleListings: EligibleListing[] | null;
  /** Whether the eligible-listing retrieval was complete. An incomplete
      retrieval that returned nothing is NOT a definitive negative (§4). */
  retrievalComplete: boolean;
  /** null = publication evidence could not be assessed. */
  publicationEpisodes: PublicationEpisode[] | null;
  /** Approved public reference knowledge (§3). Phase 1 hands "unavailable":
      no approval state exists, and Galaxy visibility does not qualify. */
  knowledge: { state: KnowledgeState; destination: string | null };
  /** null = the governed Market Evidence gate's assessment is unavailable. */
  marketEvidence: { qualifies: boolean; destination: string | null } | null;
  suppressions: LiveSuppression[];
  /** UTC calendar-day precision, `YYYY-MM-DD` (§12). Never an event time. */
  assessedOn: string;
};

/* ── Output ─────────────────────────────────────────────────────────────── */

export type PublicWatchIndexRecord = {
  reference: ReferenceIdentity;
  /** Links identify current public OFFERINGS, never distinct physical
      watches, and carry NO aggregate count (§4, §7). */
  availableNow: {
    state: AvailabilityState;
    listingUrls: string[];
    retrievalComplete: boolean;
  };
  publicListingHistory: { state: HistoryState };
  approvedPublicReferenceKnowledge: { state: KnowledgeState; destination: string | null };
  marketEvidence: { state: MarketEvidenceState; destination: string | null };
  assessment: { contractVersion: string; assessedOn: string };
};

/* ── Suppression application (§8) ───────────────────────────────────────── */

/** Does a live suppression cover this assertion at REFERENCE scope? */
export function referenceSuppressed(
  suppressions: readonly LiveSuppression[],
  assertion: Exclude<SuppressibleAssertion, "all">
): boolean {
  return suppressions.some(
    (s) =>
      s.contributionListingId === null && (s.assertion === "all" || s.assertion === assertion)
  );
}

/** Does a live suppression cover THIS contribution for this assertion?
    Keyed on the contribution, so a reference reassociation cannot evade it. */
export function contributionSuppressed(
  suppressions: readonly LiveSuppression[],
  listingId: string,
  assertion: Exclude<SuppressibleAssertion, "all">
): boolean {
  return suppressions.some(
    (s) =>
      s.contributionListingId === listingId &&
      (s.assertion === "all" || s.assertion === assertion)
  );
}

/* ── The four assertions ────────────────────────────────────────────────── */

/** §4. A positive answer needs a currently validated eligible listing. A
    definitive negative needs a successful COMPLETE check. Anything else is
    unavailable — including an incomplete retrieval that happened to be empty. */
export function assessAvailability(input: ProjectionInput): {
  state: AvailabilityState;
  listingUrls: string[];
} {
  const { eligibleListings, retrievalComplete, suppressions } = input;
  if (eligibleListings === null) {
    return { state: "availability_unavailable", listingUrls: [] };
  }
  if (referenceSuppressed(suppressions, "available_now")) {
    /* The reference's availability assertion is not permitted for publication.
       Nothing may be published as available, and no link may be offered. The
       state is not a factual negative — the check was not the thing that
       failed — so it reports as unavailable rather than as "none". */
    return { state: "availability_unavailable", listingUrls: [] };
  }
  const permitted = eligibleListings.filter(
    (l) => !contributionSuppressed(suppressions, l.listingId, "available_now")
  );
  if (permitted.length > 0) {
    return { state: "yes", listingUrls: permitted.map((l) => l.canonicalUrl) };
  }
  return {
    state: retrievalComplete
      ? "no_current_qualifying_public_listings"
      : "availability_unavailable",
    listingUrls: [],
  };
}

/** §5 + §3. A qualifying contribution needs all five admission conditions,
    and publication evidence never substitutes for association evidence. */
export function episodeQualifies(e: PublicationEpisode): boolean {
  return (
    e.durablyEvidenced &&
    e.referenceAssociationEvidenced &&
    e.publicUsePermitted &&
    !e.disqualifyingMistake
  );
}

/** §3. `established` requires the same durable publication evidence as §5 and
    must survive the listing leaving public availability — current public
    status is never itself the evidence. A suppressed contribution is outside
    the approved public coverage, so it cannot establish anything. */
export function assessHistory(input: ProjectionInput): HistoryState {
  const { publicationEpisodes, suppressions } = input;
  if (publicationEpisodes === null) return "unavailable_or_incomplete";
  if (referenceSuppressed(suppressions, "public_listing_history")) {
    return "unavailable_or_incomplete";
  }
  const qualifying = publicationEpisodes.filter(
    (e) =>
      episodeQualifies(e) &&
      !contributionSuppressed(suppressions, e.listingId, "public_listing_history")
  );
  if (qualifying.length > 0) return "established";
  /* A complete evaluation of the approved public coverage established no
     qualifying record. This is deliberately the SAME answer a reference with
     no history at all produces — a suppressed or withheld record must never
     be distinguishable from an absent one (§8, §13). It never means
     "FWT has never listed this reference". */
  return "not_established_within_coverage";
}

/** §3. Knowledge concerns only information approved for public
    representation. A `reference_knowledge` row or hidden Vault material alone
    does not qualify, and neither does Galaxy visibility. */
export function assessKnowledge(input: ProjectionInput): {
  state: KnowledgeState;
  destination: string | null;
} {
  if (referenceSuppressed(input.suppressions, "approved_public_reference_knowledge")) {
    return { state: "unavailable_or_incomplete", destination: null };
  }
  const { state, destination } = input.knowledge;
  /* A destination is only ever offered alongside a positive assertion. */
  return { state, destination: state === "approved_public_knowledge" ? destination : null };
}

/** §9. Consumes the existing governed public Market Evidence gate and never
    reimplements or loosens it. Gate unavailable stays unavailable — internally
    held data is never promoted into public evidence. */
export function assessMarketEvidence(input: ProjectionInput): {
  state: MarketEvidenceState;
  destination: string | null;
} {
  if (referenceSuppressed(input.suppressions, "market_evidence")) {
    return { state: "unavailable_or_incomplete", destination: null };
  }
  if (input.marketEvidence === null) {
    return { state: "unavailable_or_incomplete", destination: null };
  }
  return input.marketEvidence.qualifies
    ? { state: "qualifying_record", destination: input.marketEvidence.destination }
    : { state: "none_established_within_coverage", destination: null };
}

/* ── The record ─────────────────────────────────────────────────────────── */

const UTC_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function project(input: ProjectionInput): PublicWatchIndexRecord {
  if (!UTC_DAY.test(input.assessedOn)) {
    throw new Error(
      `assessedOn must be a UTC calendar day (YYYY-MM-DD), got "${input.assessedOn}"`
    );
  }
  const availability = assessAvailability(input);
  return {
    reference: input.reference,
    availableNow: {
      state: availability.state,
      listingUrls: availability.listingUrls,
      retrievalComplete: input.retrievalComplete,
    },
    publicListingHistory: { state: assessHistory(input) },
    approvedPublicReferenceKnowledge: assessKnowledge(input),
    marketEvidence: assessMarketEvidence(input),
    assessment: { contractVersion: CONTRACT_VERSION, assessedOn: input.assessedOn },
  };
}

/* ── Presentation shorthand (§3) ────────────────────────────────────────── */

export const SHORTHAND_AVAILABLE_NOW = "Available Now";
export const SHORTHAND_PREVIOUSLY_LISTED = "Previously Listed";
export const SHORTHAND_HISTORY_AVAILABILITY_UNKNOWN =
  "Public listing history established; current availability unavailable";

/**
 * The only permitted human shorthand for a record, and the conditions are
 * exact. "Available Now" takes precedence whenever availability is
 * established. "Previously Listed" is permitted ONLY when history is
 * established AND availability was successfully and completely checked AND
 * there are no current qualifying public listings — otherwise it would imply
 * an end to availability that was never confirmed. Knowledge and Market
 * Evidence are independent descriptions and never upgrade commercial status,
 * so they produce no shorthand at all.
 */
export function presentationShorthand(record: PublicWatchIndexRecord): string | null {
  if (record.availableNow.state === "yes") return SHORTHAND_AVAILABLE_NOW;
  const established = record.publicListingHistory.state === "established";
  if (!established) return null;
  if (record.availableNow.state === "no_current_qualifying_public_listings") {
    return SHORTHAND_PREVIOUSLY_LISTED;
  }
  return SHORTHAND_HISTORY_AVAILABILITY_UNKNOWN;
}

/** UTC calendar day for an assessment (§12). Never a source-event time. */
export function utcAssessmentDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
