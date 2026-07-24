/* ════════════════════════════════════════════════════════════════════════
   RESOLUTION SEAM — lib/research/resolveListingReference.ts

   The single boundary between a SOURCE CLAIM ("seller says PFC274…", "the
   auction house printed 2998-5") and a Vault identity (FAIRWATCHTRADE'S
   REVIEWED OPINION). Those are different facts with different provenance;
   this seam keeps them independent until curation earns the link.

   v2.64 — the reserved seam is now the SHARED candidate-generation boundary
   of the Identity Resolution domain (Identity Resolution Architecture
   2026-07-24, hash-pinned). Listing claims and Auction Lot claims flow
   through the SAME normalization and candidate contract — there is no
   Auction-only resolver, and there never will be one here.

   LOCKED CONTRACT (unchanged since Phase 1 — callers compile against it):
     resolveListingReference(listingId): Promise<ReferenceResolution | null>
     ReferenceResolution = { referenceId: string; resolutionMethod: string }

   v2.64 BEHAVIOUR: the seam now consults the identity domain. It returns a
   reference id ONLY when the listing's case holds a current, human-reviewed
   `exact` decision whose server-recomputed fingerprint still matches the
   listing's live claim AND whose selected target is a Vault REFERENCE.
   Anything else — no case, non-exact, stale, variant-level target — returns
   null, exactly as honest as Phase 1 was.

   CANDIDATE GENERATION IS ADVISORY. generateIdentityCandidates() normalizes
   and suggests; it never decides. Only the controlled review RPC
   (public.identity_resolution_review_case) records a decision, and only a
   human calls it.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { createServiceClient } from "@/lib/supabase/service";
import type {
  IdentityCandidateRole,
  IdentitySubjectType,
} from "@/types/identityResolution";

export type ReferenceResolution = {
  referenceId: string;
  resolutionMethod: string;
};

/** A source-neutral identity claim — a Listing's or an Auction Lot's. */
export type IdentityClaim = {
  subjectType: IdentitySubjectType;
  subjectId: string;
  brandText: string | null;
  modelText: string | null;
  referenceText: string | null;
};

/** An advisory candidate — evidence for a human, never a decision. */
export type GeneratedCandidate = {
  role: IdentityCandidateRole;
  vault_reference_id?: string;
  vault_variant_id?: string;
  evidence: string;
};

/** Load a claim from its source of record. Never rewrites anything. */
export async function loadIdentityClaim(
  subjectType: IdentitySubjectType,
  subjectId: string
): Promise<IdentityClaim | null> {
  const db = createServiceClient();
  if (subjectType === "listing") {
    const { data } = await db
      .from("listings")
      .select("id,brand,model,reference")
      .eq("id", subjectId)
      .single();
    if (!data) return null;
    return {
      subjectType,
      subjectId,
      brandText: data.brand ?? null,
      modelText: data.model ?? null,
      referenceText: data.reference ?? null,
    };
  }
  const { data } = await db
    .from("auction_evidence_lot")
    .select("id,brand_text,model_text,reference_text")
    .eq("id", subjectId)
    .single();
  if (!data) return null;
  return {
    subjectType,
    subjectId,
    brandText: data.brand_text ?? null,
    modelText: data.model_text ?? null,
    referenceText: data.reference_text ?? null,
  };
}

/**
 * Shared advisory candidate generation for BOTH source types.
 * Deterministic and modest: exact reference-string matches first, then
 * variant name/alias matches under the claimed brand. No fuzzy guessing,
 * no scores — concise evidence strings a reviewer can check in seconds.
 */
export async function generateIdentityCandidates(
  claim: IdentityClaim
): Promise<GeneratedCandidate[]> {
  const db = createServiceClient();
  const out: GeneratedCandidate[] = [];

  const ref = claim.referenceText?.trim();
  if (ref) {
    const { data: refs } = await db
      .from("vault_references")
      .select("id,reference")
      .ilike("reference", ref);
    for (const r of refs ?? []) {
      out.push({
        role: "alternative",
        vault_reference_id: r.id,
        evidence: `Vault reference "${r.reference}" exactly matches the reported reference "${ref}".`,
      });
    }
  }

  const model = claim.modelText?.trim();
  if (model && out.length === 0) {
    const { data: vars } = await db
      .from("vault_variants")
      .select("id,name,search_aliases")
      .ilike("name", `%${model}%`)
      .limit(5);
    for (const v of vars ?? []) {
      out.push({
        role: "alternative",
        vault_variant_id: v.id,
        evidence: `Vault variant "${v.name}" matches the reported model text "${model}".`,
      });
    }
  }

  // Deterministic ordering: reference matches (already first), then by id.
  return out.sort((a, b) =>
    (a.vault_reference_id ?? `z${a.vault_variant_id}`).localeCompare(
      b.vault_reference_id ?? `z${b.vault_variant_id}`
    )
  );
}

/**
 * Resolve a listing to the Vault reference it has been REVIEWED as being,
 * when — and only when — a current, fingerprint-valid, human-reviewed exact
 * decision with a reference-level target exists. Locked signature.
 */
export async function resolveListingReference(
  listingId: string
): Promise<ReferenceResolution | null> {
  const db = createServiceClient();

  const { data: kase } = await db
    .from("identity_resolution_case")
    .select("id")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (!kase) return null;

  const { data: decision } = await db
    .from("identity_resolution_decision")
    .select("id,outcome,claim_fingerprint")
    .eq("case_id", kase.id)
    .eq("is_current", true)
    .maybeSingle();
  if (!decision || decision.outcome !== "exact") return null;

  // Staleness: recompute the fingerprint server-side and compare.
  const { data: liveFp, error: fpErr } = await db.rpc(
    "identity_resolution_claim_fingerprint",
    { p_subject_type: "listing", p_subject_id: listingId }
  );
  if (fpErr || liveFp !== decision.claim_fingerprint) return null;

  const { data: cand } = await db
    .from("identity_resolution_candidate")
    .select("vault_reference_id")
    .eq("decision_id", decision.id)
    .eq("candidate_role", "selected")
    .maybeSingle();
  if (!cand?.vault_reference_id) return null; // variant-level exact → no reference id

  // The target must still exist.
  const { data: target } = await db
    .from("vault_references")
    .select("id")
    .eq("id", cand.vault_reference_id)
    .maybeSingle();
  if (!target) return null;

  return {
    referenceId: cand.vault_reference_id,
    resolutionMethod: "reviewed_exact",
  };
}
