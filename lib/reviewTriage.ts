/* ════════════════════════════════════════════════════════════════════════
   FOUNDER REVIEW TRIAGE — THE POLICY — lib/reviewTriage.ts

   Pure functions. No React, no I/O, no database. The whole V1 rule set is
   readable in one screen on purpose: a policy you cannot read is a policy
   nobody can audit.

   ── THE ONE THING TO UNDERSTAND ────────────────────────────────────────
   ESCALATE IS THE DEFAULT, STRUCTURALLY. PASS is reached only by an
   explicit positive predicate — every fact must be clear at once. There is
   no branch anywhere below where an unrecognised fact pattern falls through
   into a disposition. If the rules do not cover it, a person looks at it.

   ── WHAT THE RULES ARE DRAWN FROM ──────────────────────────────────────
   None of this policy is invented here. Each rule consumes a decision that
   already existed in the product:

     evidence_incomplete        aggregateIntegrityForListing holds on
                                results_pending / provider_unavailable —
                                triage must never fire on an evidence set
                                it knows is unfinished.
     finding_requires_founder   isSystemReleasableHold() is false for
                                finding_review. Repo law, stated in
                                lib/integrity.ts: "finding_review — founder-
                                only exit." Triage may not take that exit.
     authenticity_evidence_     computeAttention() already treats flagged
       flagged                  evidence as founder work, and
                                findingRequiresReview() names the same two
                                classifications as review-worthy.
     private_release_requires_  Private Listing V1: approval releases a real
       founder                  watch to ONE named buyer. The documented door
                                is founder approval.
     unrecognized_maker_        custom_brand_flag marks a maker the brand
       admission                authority chain did not recognise, and
                                admission for anything outside the Vault is
                                selective by definition — a judgment call.
     availability_not_in_stock  Two existing hard gates already refuse this
                                listing: submit_listing_for_review returns
                                not_available_for_submission, and the
                                publication law refuses not_available. The
                                remedy belongs entirely to the seller.
     founder_decision_          listing_decision_events already records a
       outstanding              founder's returned_to_draft / rejected /
                                clarification_requested as an adverse decision
                                with actor_kind='founder'. That decision is a
                                standing instruction to the seller. Triage may
                                inspect the resubmission; it may not publish
                                over a person's outstanding decision. Cleared
                                only by a later founder approval.

     no_open_objection          The integrity gate returning clean, with
                                coverage satisfied, was the product's own
                                governed condition for a listing to go live
                                without human action. v6.34 did not overturn
                                that condition — it required that reaching
                                published be a RECORDED DECISION. Triage
                                supplies the decision that was missing.

   ── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────
   No score. No confidence band. No threshold. No "probably fine". A
   probabilistic number can never be the thing that publishes or refuses a
   watch, so none is computed, stored, or read.

   Pinned by scripts/review-triage.test.mjs.
   ════════════════════════════════════════════════════════════════════════ */

/** Bump when the rule set changes. Historical rows keep the version that
    actually decided them, so an old disposition is never re-read under
    rules it was never subject to. */
export const TRIAGE_POLICY_VERSION = "v1";

export const TRIAGE_OUTCOMES = ["pass", "fail", "escalate"] as const;
export type TriageOutcome = (typeof TRIAGE_OUTCOMES)[number];

export const TRIAGE_REASONS = [
  "founder_decision_outstanding",
  "evidence_incomplete",
  "finding_requires_founder",
  "authenticity_evidence_flagged",
  "private_release_requires_founder",
  "unrecognized_maker_admission",
  "availability_not_in_stock",
  "no_open_objection",
  "policy_unmapped",
] as const;
export type TriageReason = (typeof TRIAGE_REASONS)[number];

/** The facts triage reads. Every one is an existing runtime truth — nothing
    here is derived from a model, and nothing is a guess. */
export type TriageFacts = {
  /** True when the most recent FOUNDER decision on this listing was adverse
      (returned_to_draft / rejected / clarification_requested) and no founder
      approval has followed it. A machine may not overrule a standing human
      decision — it may only hand the listing back to the person who made it. */
  founderDecisionOutstanding: boolean;
  /** listings.integrity_hold_reason as the gate just computed it. */
  holdReason: string | null;
  /** Rows in listing_integrity_evidence classified review-worthy. */
  flaggedEvidenceCount: number;
  /** listings.private_buyer_id is set. */
  hasPrivateBuyer: boolean;
  /** listings.custom_brand_flag. */
  customBrandFlag: boolean;
  /** listings.details.availability. */
  availability: string | null;
};

export type TriageDecision = {
  outcome: TriageOutcome;
  reason: TriageReason;
  /** One internal sentence. Never shown to a seller. */
  detail: string;
};

/* The system-hold vocabulary, mirrored from lib/integrity.ts. Kept as a
   local literal set so the policy stays pure and importable by a test with
   no Supabase types in scope; the values are pinned against the integrity
   module by scripts/review-triage.test.mjs. */
const HOLD_EVIDENCE_INCOMPLETE = ["results_pending", "provider_unavailable"];
const HOLD_FOUNDER_ONLY = "finding_review";

/** listings.details.availability that no listing may be published under. */
export const AVAILABILITY_BLOCKED = "Not Currently Available";

/* ── The seller's words for the one automatic adverse disposition ────────
   FAIL returns the listing to the seller. It says what is wrong and what to
   do, names no machinery, and accuses nobody — the listing is not being
   judged, it is being handed back with the one thing it needs. The database
   refuses an adverse decision event with a blank message, so this string is
   load-bearing, not decoration. */
export const TRIAGE_FAIL_SELLER_MESSAGE: Record<string, string> = {
  availability_not_in_stock:
    "This listing is marked as not currently available, so it can't go live yet. " +
    "Set its availability to In Stock and submit it again — nothing else needs to change.",
};

/* ── The policy ─────────────────────────────────────────────────────────
   Read top to bottom. Every escalation is checked BEFORE the one adverse
   rule, so a listing that is both uncertain and blocked goes to Jason
   rather than being handed back automatically. PASS is last and requires
   everything above it to have declined to fire. */
export function evaluateTriage(facts: TriageFacts): TriageDecision {
  /* Checked before anything else. A founder who returned this watch for
     changes is not overruled by a resubmission, and no amount of clean
     evidence may publish over them. The listing goes back to the person
     whose decision is still standing. */
  if (facts.founderDecisionOutstanding) {
    return {
      outcome: "escalate",
      reason: "founder_decision_outstanding",
      detail:
        "A founder returned, rejected, or requested clarification on this listing and has not approved it since. Triage may inspect the resubmission but may not publish over a standing founder decision.",
    };
  }

  const hold = facts.holdReason;

  if (hold !== null) {
    if (HOLD_EVIDENCE_INCOMPLETE.includes(hold)) {
      return {
        outcome: "escalate",
        reason: "evidence_incomplete",
        detail:
          "The integrity check has not completed for every photograph, so there is no finished evidence set to triage.",
      };
    }
    if (hold === HOLD_FOUNDER_ONLY) {
      return {
        outcome: "escalate",
        reason: "finding_requires_founder",
        detail:
          "A review-worthy finding is on this listing. That hold has a founder-only exit and triage may not take it.",
      };
    }
    // An unrecognised hold value is precisely the case the safe default exists for.
    return {
      outcome: "escalate",
      reason: "policy_unmapped",
      detail: `The listing carries a hold reason this policy does not recognise (${hold}).`,
    };
  }

  if (facts.flaggedEvidenceCount > 0) {
    return {
      outcome: "escalate",
      reason: "authenticity_evidence_flagged",
      detail:
        `Photograph authenticity evidence is flagged on this listing (${facts.flaggedEvidenceCount} finding` +
        `${facts.flaggedEvidenceCount === 1 ? "" : "s"}) and no founder has resolved it.`,
    };
  }

  if (facts.hasPrivateBuyer) {
    return {
      outcome: "escalate",
      reason: "private_release_requires_founder",
      detail:
        "Approving this listing would release it to one named buyer. That release is a founder decision.",
    };
  }

  if (facts.customBrandFlag) {
    return {
      outcome: "escalate",
      reason: "unrecognized_maker_admission",
      detail:
        "The maker is outside the recognised brand authority. Admission is selective and belongs to Founder Review.",
    };
  }

  if (facts.availability === AVAILABILITY_BLOCKED) {
    return {
      outcome: "fail",
      reason: "availability_not_in_stock",
      detail:
        "The listing cannot be published while its availability is 'Not Currently Available'. Returned to the seller, who owns the fix.",
    };
  }

  return {
    outcome: "pass",
    reason: "no_open_objection",
    detail:
      "The integrity check completed with nothing outstanding, no evidence is flagged, and no governed condition requires a founder.",
  };
}

/** The seller-facing message for an adverse triage outcome, or null when the
    outcome is not adverse. A FAIL reason with no message is a policy bug —
    the caller must refuse to dispose rather than write a blank one. */
export function triageSellerMessage(decision: TriageDecision): string | null {
  if (decision.outcome !== "fail") return null;
  return TRIAGE_FAIL_SELLER_MESSAGE[decision.reason] ?? null;
}

/* ── Founder-facing attention line ──────────────────────────────────────
   Marketplace Control renders attention reasons as plain sentences. An
   escalation contributes one, in the room's existing voice. */
export function triageAttentionReason(reason: string, detail: string | null): string {
  const said = (detail ?? "").trim();
  return said ? `Triage escalated — ${said}` : `Triage escalated (${reason})`;
}
