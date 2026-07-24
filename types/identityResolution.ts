// ════════════════════════════════════════════════════════════════════════
// Identity Resolution Domain — hand-written types (v2.64)
//
// Mirrors the DB CHECK constraints as string-literal unions (repo convention).
// Keep in lockstep with 20260724213000_identity_resolution_domain.sql.
//
// One source-neutral domain for Listing AND Auction Lot identity claims.
// The source claim is never rewritten; only a current, fingerprint-valid,
// reviewed EXACT decision is Vault-attachable.
// ════════════════════════════════════════════════════════════════════════

export type IdentitySubjectType = "listing" | "auction_lot";

export type IdentityOutcome =
  | "exact"
  | "related"
  | "probable"
  | "ambiguous"
  | "unresolved"
  | "rejected";

export type IdentityCandidateRole = "selected" | "alternative" | "related" | "rejected";

export interface IdentityResolutionCase {
  id: string;
  subject_type: IdentitySubjectType;
  listing_id: string | null; // exactly one subject FK present, matching type
  auction_lot_id: string | null;
  created_at: string;
}

export interface IdentityResolutionDecision {
  id: string;
  case_id: string;
  chain_root_id: string; // first decision is self-rooted (chain_root_id = id)
  supersedes_decision_id: string | null; // set server-side on corrections only
  is_current: boolean; // one current per case (partial unique index)
  outcome: IdentityOutcome;
  claim_fingerprint: string; // server-built sha256 of current source claim
  review_reason: string; // non-blank
  reviewed_by: string;
  reviewed_at: string;
  created_at: string;
}

export interface IdentityResolutionCandidate {
  id: string;
  decision_id: string;
  vault_reference_id: string | null; // exactly one Vault target present
  vault_variant_id: string | null;
  candidate_role: IdentityCandidateRole;
  evidence: string; // non-blank, concise — never a public confidence score
  ordinal: number; // deterministic ordering, 1-based
  created_at: string;
}

/** Candidate payload for the review RPC (ordinals derive from array order). */
export interface IdentityReviewCandidateInput {
  role: IdentityCandidateRole;
  vault_reference_id?: string | null;
  vault_variant_id?: string | null;
  evidence: string;
}

/** public.identity_resolution_review_case(text,uuid,uuid,text,jsonb,text,uuid,uuid) */
export interface IdentityReviewCaseParams {
  p_subject_type: IdentitySubjectType;
  p_listing_id: string | null;
  p_auction_lot_id: string | null;
  p_outcome: IdentityOutcome;
  p_candidates: IdentityReviewCandidateInput[];
  p_review_reason: string;
  p_reviewer_uid: string;
  /** null on an initial review; the live current decision id on a correction */
  p_expected_current_decision_id: string | null;
}

/** What the read helper returns — eligibility is computed, never stored. */
export interface CurrentIdentityDecision {
  decision: IdentityResolutionDecision;
  candidates: IdentityResolutionCandidate[];
  /** server-recomputed fingerprint still matches the stored one */
  fingerprintValid: boolean;
  /** current + exact + fingerprint-valid + existing selected target */
  attachable: boolean;
}
