/* ════════════════════════════════════════════════════════════════════════
   VAULT ENRICHMENT — AUTHORING (plan construction, no database write)

   SERVER-ONLY: hashes plan bytes with node:crypto. The client-safe fact
   vocabulary and entry rules live in ./enrichmentFactTypes — one definition
   feeds both the form and this planner, so they cannot drift.

   This module turns a hand-entered specification into the exact artifact the
   proven controlled-apply path already consumes: a one-record plan file, the
   SHA-256 of its raw bytes, and the RPC call that references that hash.

   WHY IT EXISTS. The enrichment capability lived only in a second repository,
   a folder of validated packs, a validator, a planner, an apply script and a
   ten-parameter SECURITY DEFINER function. Knowledge spread that thin is
   forgotten. Here the form IS the contract.

   WHAT IT DOES NOT DO. It never writes to the database, never calls the RPC,
   and never invents evidence. It produces an artifact a human then applies
   deliberately.

   FAITHFULNESS IS THE WHOLE POINT. The apply script re-derives the payload
   from `incoming` and refuses the plan if it does not match (STALE_PLAN).
   Inputs are trimmed and coerced in the fact definitions so the stored
   `incoming` is exactly what the payload was built from.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
import {
  APPLY_SCRIPT_FACT_TYPES,
  buildEvidence,
  evidenceProblems,
  getFactDefinition,
  type EnrichmentFactType,
  type EvidenceInput,
  type FactValuesInput,
} from "./enrichmentFactTypes.ts";

export {
  APPLY_SCRIPT_FACT_TYPES,
  ENRICHMENT_FACT_TYPES,
  EVIDENCE_FIELDS,
  FACT_DEFINITIONS,
  buildEvidence,
  evidenceProblems,
  getFactDefinition,
} from "./enrichmentFactTypes.ts";
export type {
  EnrichmentFactType,
  Evidence,
  EvidenceInput,
  FactDefinition,
  FactValuesInput,
} from "./enrichmentFactTypes.ts";

/* ── identity + plan ──────────────────────────────────────────────────── */

export type ResolvedIdentity = {
  reference_id: string;
  reference: string;
  brand: { id: string; name: string; slug: string };
  collection: { id: string; name: string };
  family: { id: string; name: string };
  variant: { id: string; name: string };
};

export type PlanClassification = "IMPORT" | "SKIP" | "CONFLICT";

export type BuiltPlan = {
  classification: PlanClassification;
  reason: string;
  /** Present only when classification is IMPORT. */
  planJson: string | null;
  planSha256Upper: string | null;
  sql: string | null;
  cliCommand: string | null;
  appliesWithScript: boolean;
  problems: string[];
  existingValues: Record<string, number | null> | null;
};

function mergeFactIntoMetadata(
  factType: string,
  existingMetadata: unknown,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existingMetadata && typeof existingMetadata === "object"
      ? (existingMetadata as Record<string, unknown>)
      : {};
  const enrichment =
    base.enrichment && typeof base.enrichment === "object"
      ? (base.enrichment as Record<string, unknown>)
      : {};
  return { ...base, enrichment: { ...enrichment, [factType]: payload } };
}

function valuesEqual(
  a: Record<string, number | null>,
  b: Record<string, number | null>
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k] ?? null;
    const y = b[k] ?? null;
    if (x === null || y === null) return false;
    if (Math.abs(x - y) > 1e-6) return false;
  }
  return true;
}

/** SQL string literal — single quotes doubled. Values here are operator-typed
    and land inside a hand-run statement, so quoting is explicit rather than
    assumed. */
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function buildEnrichmentPlan(params: {
  identity: ResolvedIdentity;
  factType: EnrichmentFactType;
  values: FactValuesInput;
  evidence: EvidenceInput;
  existingMetadata: unknown;
  expectedEnv: string;
  appliedBy: string;
}): BuiltPlan {
  const {
    identity,
    factType,
    values,
    evidence: evidenceInput,
    existingMetadata,
    expectedEnv,
    appliedBy,
  } = params;

  const def = getFactDefinition(factType);
  if (!def) {
    return {
      classification: "CONFLICT",
      reason: `unknown fact_type ${factType}`,
      planJson: null,
      planSha256Upper: null,
      sql: null,
      cliCommand: null,
      appliesWithScript: false,
      problems: [`unknown fact_type ${factType}`],
      existingValues: null,
    };
  }

  const evidence = buildEvidence(evidenceInput);
  const incomingValues = def.buildValues(values);
  const problems = [...def.valueProblems(incomingValues), ...evidenceProblems(evidence)];

  const existingValues = def.readExisting(existingMetadata);
  if (existingValues) {
    const same = valuesEqual(existingValues, incomingValues);
    return {
      classification: same ? "SKIP" : "CONFLICT",
      reason: same
        ? "exact_identity_single_row_target_fact_already_present_equal"
        : "exact_identity_single_row_target_fact_already_present_differing",
      planJson: null,
      planSha256Upper: null,
      sql: null,
      cliCommand: null,
      appliesWithScript: false,
      problems: same
        ? ["This reference already carries this fact with the same values — nothing to apply."]
        : [
            "This reference already carries this fact with DIFFERENT values. Overwriting is a separate, authorized decision and this room will not plan it.",
          ],
      existingValues,
    };
  }

  if (problems.length > 0) {
    return {
      classification: "CONFLICT",
      reason: "record_not_applyable",
      planJson: null,
      planSha256Upper: null,
      sql: null,
      cliCommand: null,
      appliesWithScript: false,
      problems,
      existingValues: null,
    };
  }

  // `incoming` is stored exactly as the payload was built from it, so the
  // apply script's rebuild-and-compare check can never drift.
  const incoming: Record<string, unknown> = {
    manufacturer: identity.brand.name,
    model: identity.family.name,
    reference: identity.reference,
    ...incomingValues,
    source_type: evidence.source_type,
    source_name: evidence.source_name,
    source_url: evidence.source_url,
    date_accessed: evidence.date_accessed,
    excerpt: evidence.excerpt,
    verified: true,
  };

  const proposedFactPayload = def.buildPayload(values, evidence);
  const proposedMetadata = mergeFactIntoMetadata(factType, existingMetadata, proposedFactPayload);

  const record = {
    input_index: 0,
    incoming,
    fact_type: factType,
    incoming_values: incomingValues,
    evidence,
    import_authorized: true,
    resolved_identity: identity,
    candidate_identities: null,
    existing_values: null,
    proposed_fact_payload: proposedFactPayload,
    proposed_metadata: proposedMetadata,
    evidence_status: { status: "existing_absent", differing_fields: [], existing_evidence: null },
    diagnostic_candidates: [],
    diagnostic_only: false,
    classification: "IMPORT",
    reason: "exact_identity_single_row_target_fact_absent",
  };

  // The hash is over the raw bytes of the plan FILE. Emit the exact text once
  // and hash that same text, so the operator can never save a variant.
  const planJson = JSON.stringify([record], null, 2);
  const planSha256Upper = createHash("sha256").update(planJson, "utf8").digest("hex").toUpperCase();

  const payloadLiteral = sqlLiteral(JSON.stringify(proposedFactPayload, null, 2));
  const sql = [
    "-- Vault enrichment — one controlled fact.",
    `-- ${identity.brand.name} · ${identity.reference} · ${factType}`,
    "-- The hash below is the SHA-256 of the plan file's raw bytes. Keep the",
    "-- plan file with this statement; the pair is the record of what was done.",
    "select public.enrich_vault_reference(",
    `  p_reference_id    => ${sqlLiteral(identity.reference_id)}::uuid,`,
    `  p_manufacturer    => ${sqlLiteral(identity.brand.name)},`,
    `  p_reference       => ${sqlLiteral(identity.reference)},`,
    `  p_fact_type       => ${sqlLiteral(factType)},`,
    `  p_payload         => ${payloadLiteral}::jsonb,`,
    `  p_computed_hash   => ${sqlLiteral(planSha256Upper)},`,
    `  p_authorized_hash => ${sqlLiteral(planSha256Upper)},`,
    `  p_expected_env    => ${sqlLiteral(expectedEnv)},`,
    `  p_applied_by      => ${sqlLiteral(appliedBy)},`,
    "  p_dry_run         => true",
    ");",
    "",
    "-- Reviewed the returned row and want it written? Re-run with:",
    "--   p_dry_run => false",
  ].join("\n");

  const appliesWithScript = APPLY_SCRIPT_FACT_TYPES.includes(factType);
  const file = planFileName(identity.reference, factType);
  const cliCommand = appliesWithScript
    ? [
        "node scripts/apply-enrichment-import.mjs \\",
        `  --plan scripts/import-plans/${file} \\`,
        `  --authorized-hash ${planSha256Upper} \\`,
        `  --expected-env ${expectedEnv}`,
        "#   add --apply once the dry run reads correctly",
      ].join("\n")
    : null;

  return {
    classification: "IMPORT",
    reason: "exact_identity_single_row_target_fact_absent",
    planJson,
    planSha256Upper,
    sql,
    cliCommand,
    appliesWithScript,
    problems: [],
    existingValues: null,
  };
}

export function planFileName(reference: string, factType: string): string {
  return `${reference.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${factType}-import-plan.json`;
}
