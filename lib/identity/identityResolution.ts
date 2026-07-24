/* ════════════════════════════════════════════════════════════════════════
   IDENTITY RESOLUTION — read helpers  (lib/identity/identityResolution.ts)

   Server-only reads over the shared identity domain (v2.64). These helpers
   return only what downstream systems are allowed to act on: the CURRENT
   decision, with eligibility computed live — never stored, never trusted
   from a client.

   Attachability law (Identity Resolution Architecture §9): a decision
   supports Vault attachment only when it is current, `exact`, human-reviewed,
   its server-recomputed claim fingerprint still matches, and its selected
   target still exists. Everything else is source-level evidence only.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { createServiceClient } from "@/lib/supabase/service";
import type {
  CurrentIdentityDecision,
  IdentityResolutionCandidate,
  IdentityResolutionDecision,
  IdentitySubjectType,
} from "@/types/identityResolution";

/**
 * The current decision for a subject, with eligibility computed live.
 * Returns null when no case or no current decision exists.
 */
export async function getCurrentIdentityDecision(
  subjectType: IdentitySubjectType,
  subjectId: string
): Promise<CurrentIdentityDecision | null> {
  const db = createServiceClient();
  const subjectCol = subjectType === "listing" ? "listing_id" : "auction_lot_id";

  const { data: kase } = await db
    .from("identity_resolution_case")
    .select("id")
    .eq(subjectCol, subjectId)
    .maybeSingle();
  if (!kase) return null;

  const { data: decision } = await db
    .from("identity_resolution_decision")
    .select("*")
    .eq("case_id", kase.id)
    .eq("is_current", true)
    .maybeSingle();
  if (!decision) return null;

  const { data: candidates } = await db
    .from("identity_resolution_candidate")
    .select("*")
    .eq("decision_id", decision.id)
    .order("ordinal", { ascending: true });

  // Staleness is computed by the ONE canonical fingerprint implementation.
  const { data: liveFp, error: fpErr } = await db.rpc(
    "identity_resolution_claim_fingerprint",
    { p_subject_type: subjectType, p_subject_id: subjectId }
  );
  const fingerprintValid = !fpErr && liveFp === decision.claim_fingerprint;

  let attachable = false;
  if (fingerprintValid && decision.outcome === "exact") {
    const selected = (candidates ?? []).find((c) => c.candidate_role === "selected");
    if (selected) {
      if (selected.vault_reference_id) {
        const { data } = await db
          .from("vault_references")
          .select("id")
          .eq("id", selected.vault_reference_id)
          .maybeSingle();
        attachable = Boolean(data);
      } else if (selected.vault_variant_id) {
        const { data } = await db
          .from("vault_variants")
          .select("id")
          .eq("id", selected.vault_variant_id)
          .maybeSingle();
        attachable = Boolean(data);
      }
    }
  }

  return {
    decision: decision as IdentityResolutionDecision,
    candidates: (candidates ?? []) as IdentityResolutionCandidate[],
    fingerprintValid,
    attachable,
  };
}
