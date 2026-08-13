import { createServiceClient } from "@/lib/supabase/service";
import {
  admissionFor,
  type AdmissionState,
  type ClaimClass,
  type ClaimInput,
  type RefusalCode,
  type ResearchOutcome,
} from "./claimAdmission";

/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — CLAIMS CORPUS (server-only)

   The write and read seam for the exact-reference claims corpus. Admission
   is decided ONLY by lib/dossier/claimAdmission.ts, never here — this module
   persists the verdict and reads it back. Nothing in this file touches
   listings, publication, or any served artifact.

   ORDER MATTERS ON WRITE. A DESIGN_DESCRIPTION may only rest on claims that
   are themselves admitted, so evidence-backed classes are evaluated first
   and the admitted-key set grows as the pass proceeds. That is deliberate:
   an observation can never be admitted by leaning on a claim that was itself
   refused.

   Corrections are versioned replacements: an existing current row for the
   same key is retired and the new row records what it superseded. Nothing
   is edited in place, so the corpus stays auditable.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export type PersistedClaim = {
  id: string;
  claimKey: string;
  claimClass: ClaimClass;
  outcome: ResearchOutcome;
  admission: AdmissionState;
  refusals: RefusalCode[];
  subject: string;
  statement: string;
  values: string[];
  qualifier: string | null;
  options: { value: string; evidence: string }[];
  supports: string[];
  moduleHint: string | null;
};

type ClaimRow = {
  id: string;
  claim_key: string;
  claim_class: ClaimClass;
  outcome: ResearchOutcome;
  admission: AdmissionState;
  refusals: RefusalCode[] | null;
  subject: string;
  statement: string;
  values: unknown;
  qualifier: string | null;
  options: unknown;
  supports: string[] | null;
  module_hint: string | null;
};

function toPersisted(row: ClaimRow): PersistedClaim {
  return {
    id: row.id,
    claimKey: row.claim_key,
    claimClass: row.claim_class,
    outcome: row.outcome,
    admission: row.admission,
    refusals: row.refusals ?? [],
    subject: row.subject,
    statement: row.statement,
    values: Array.isArray(row.values) ? (row.values as string[]) : [],
    qualifier: row.qualifier,
    options: Array.isArray(row.options)
      ? (row.options as { value: string; evidence: string }[])
      : [],
    supports: row.supports ?? [],
    moduleHint: row.module_hint,
  };
}

/** Evidence-backed classes are decided before observations that rest on them. */
const CLASS_ORDER: Record<ClaimClass, number> = {
  OBJECTIVE_FACT: 0,
  CONTEXTUAL_FACT: 1,
  DESIGN_DESCRIPTION: 2,
};

export type PopulationResult = {
  referenceId: string;
  referenceText: string;
  admitted: number;
  refused: number;
  pendingReview: number;
  claimSetHash: string | null;
  claims: PersistedClaim[];
};

/**
 * Persist a claim packet for one exact reference, deciding admission through
 * the governed contracts. Re-running with identical claims is idempotent in
 * content: keys already current with the same governed content are left
 * alone, so the claim-set hash is stable across a no-op repopulation.
 */
export async function populateReferenceClaims(
  referenceId: string,
  claims: readonly ClaimInput[],
  provenance = "MACHINE_RESEARCH"
): Promise<PopulationResult> {
  const db = createServiceClient();

  const { data: reference, error: refError } = await db
    .from("vault_references")
    .select("id, reference")
    .eq("id", referenceId)
    .maybeSingle();
  if (refError || !reference) {
    throw new Error(`exact reference ${referenceId} not found in the Vault`);
  }
  const referenceText = (reference as { reference: string }).reference;

  const { data: existingRows } = await db
    .from("collector_dossier_claims")
    .select("id, claim_key, claim_class, outcome, admission, refusals, subject, statement, values, qualifier, options, supports, module_hint")
    .eq("vault_reference_id", referenceId)
    .eq("lifecycle", "current");
  const existing = new Map(
    ((existingRows ?? []) as ClaimRow[]).map((r) => [r.claim_key, r])
  );

  const admittedKeys = new Set<string>(
    ((existingRows ?? []) as ClaimRow[])
      .filter((r) => r.admission === "ADMITTED")
      .map((r) => r.claim_key)
  );

  const ordered = [...claims].sort(
    (a, b) => CLASS_ORDER[a.claimClass] - CLASS_ORDER[b.claimClass]
  );

  for (const claim of ordered) {
    const verdict = admissionFor(claim, { referenceText, admittedKeys: [...admittedKeys] });

    const payload = {
      vault_reference_id: referenceId,
      claim_key: claim.claimKey,
      claim_class: claim.claimClass,
      outcome: claim.outcome,
      admission: verdict.admission,
      refusals: verdict.refusals,
      subject: claim.subject,
      statement: claim.statement,
      values: claim.values,
      qualifier: claim.qualifier ?? null,
      options: claim.options ?? [],
      evidence: claim.evidence,
      supports: claim.supports ?? [],
      module_hint: claim.moduleHint ?? null,
      provenance,
      lifecycle: "current",
    };

    const prior = existing.get(claim.claimKey);
    const unchanged =
      prior &&
      prior.claim_class === claim.claimClass &&
      prior.outcome === claim.outcome &&
      prior.admission === verdict.admission &&
      prior.statement === claim.statement &&
      prior.qualifier === (claim.qualifier ?? null) &&
      JSON.stringify(prior.values ?? []) === JSON.stringify(claim.values);

    if (unchanged) {
      if (verdict.admission === "ADMITTED") admittedKeys.add(claim.claimKey);
      continue;
    }

    // Versioned replacement: retire the prior row, never edit it in place.
    if (prior) {
      await db
        .from("collector_dossier_claims")
        .update({ lifecycle: "retired" })
        .eq("id", prior.id);
    }

    const { error: insertError } = await db
      .from("collector_dossier_claims")
      .insert({ ...payload, supersedes_id: prior?.id ?? null });
    if (insertError) {
      throw new Error(`claim ${claim.claimKey} could not be persisted: ${insertError.message}`);
    }
    if (verdict.admission === "ADMITTED") admittedKeys.add(claim.claimKey);
  }

  return readReferenceClaims(referenceId);
}

/** Read the corpus back as a complete packet for one exact reference. */
export async function readReferenceClaims(referenceId: string): Promise<PopulationResult> {
  const db = createServiceClient();

  const { data: reference } = await db
    .from("vault_references")
    .select("reference")
    .eq("id", referenceId)
    .maybeSingle();

  const { data: rows, error } = await db
    .from("collector_dossier_claims")
    .select("id, claim_key, claim_class, outcome, admission, refusals, subject, statement, values, qualifier, options, supports, module_hint")
    .eq("vault_reference_id", referenceId)
    .eq("lifecycle", "current")
    .order("claim_key");
  if (error) throw new Error(`claims read failed: ${error.message}`);

  const claims = ((rows ?? []) as ClaimRow[]).map(toPersisted);
  const { data: hash } = await db.rpc("collector_dossier_claim_set_hash", {
    p_reference_id: referenceId,
  });

  return {
    referenceId,
    referenceText: (reference as { reference: string } | null)?.reference ?? "",
    admitted: claims.filter((c) => c.admission === "ADMITTED").length,
    refused: claims.filter((c) => c.admission === "REFUSED").length,
    pendingReview: claims.filter((c) => c.admission === "PENDING_REVIEW").length,
    claimSetHash: (hash as string | null) ?? null,
    claims,
  };
}
