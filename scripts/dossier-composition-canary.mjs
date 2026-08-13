/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — CLAIM-LINKED COMPOSITION CANARY (Breitling)

   Run: node scripts/dossier-composition-canary.mjs            (dry: real
        claims, real composer, real verifier — writes NOTHING)
        node scripts/dossier-composition-canary.mjs --apply    (persists the
        attempt row and, if verified, the draft article)

   Drives the REAL pipeline (lib/dossier/compositionPipeline.ts) against the
   production corpus for the canonical canary:

     Breitling UB0134101B1U1 · vault ref aa71f4a5-1a5e-4488-b4b2-5f3206c9a411

   Only current ADMITTED + RETRIEVAL_BOUND claims can reach the composer —
   that filter lives in the pipeline itself, not here. Legacy unbound
   admitted claims stay out until honestly rebound.

   WHAT --apply CAN NEVER DO: approve anything. A verified attempt yields a
   status='draft' article row; the public Dossier keeps serving its
   last-good artifact until the founder decides otherwise.
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");
for (const line of readFileSync(join(here, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const { runCompositionAttempt } = await import("../lib/dossier/compositionPipeline.ts");
const { callDossierRole } = await import("../lib/dossier/providerRoles.ts");
const { createClient } = await import("@supabase/supabase-js");

const REFERENCE_ID = "aa71f4a5-1a5e-4488-b4b2-5f3206c9a411";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

/* ── The production store ──────────────────────────────────────────────
   Reads are always real. Writes happen only under --apply; a dry run
   records them locally so the full pipeline still executes end to end. */
const dryWrites = { attempts: new Map(), drafts: [] };
let dryCounter = 0;

const store = {
  async readIdentity(referenceId) {
    const { data, error } = await db
      .from("vault_references")
      .select(
        "id, reference, vault_variants(name, vault_families(name, vault_collections(name, vault_brands(name))))"
      )
      .eq("id", referenceId)
      .maybeSingle();
    if (error || !data) return null;
    const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null);
    const variant = one(data.vault_variants);
    const family = one(variant?.vault_families);
    const collection = one(family?.vault_collections);
    const brand = one(collection?.vault_brands);
    if (!variant || !collection || !brand) return null;
    return {
      brand: brand.name ?? "",
      collection: collection.name ?? "",
      model: variant.name ?? "",
      reference: data.reference ?? "",
    };
  },
  async readClaims(referenceId) {
    const { data, error } = await db
      .from("collector_dossier_claims")
      .select(
        "claim_key, claim_class, admission, evidence_binding, subject, statement, values, qualifier, supports, module_hint"
      )
      .eq("vault_reference_id", referenceId)
      .eq("lifecycle", "current")
      .order("claim_key");
    if (error) throw new Error(`claims read failed: ${error.message}`);
    return (data ?? []).map((r) => ({
      claimKey: r.claim_key,
      claimClass: r.claim_class,
      admission: r.admission,
      evidenceBinding: r.evidence_binding ?? "UNBOUND",
      subject: r.subject,
      statement: r.statement,
      values: Array.isArray(r.values) ? r.values : [],
      qualifier: r.qualifier,
      supports: r.supports ?? [],
      moduleHint: r.module_hint,
    }));
  },
  async readClaimSetHash(referenceId) {
    const { data, error } = await db.rpc("collector_dossier_claim_set_hash", {
      p_reference_id: referenceId,
    });
    if (error) throw new Error(`claim-set hash failed: ${error.message}`);
    return data ?? null;
  },
  async insertAttempt(row) {
    if (!APPLY) {
      const id = `dry-attempt-${++dryCounter}`;
      dryWrites.attempts.set(id, { ...row, status: "composing" });
      return id;
    }
    const { data, error } = await db
      .from("collector_dossier_composition_attempts")
      .insert({
        vault_reference_id: row.referenceId,
        claim_set_hash: row.claimSetHash,
        input_claim_keys: row.inputClaimKeys,
        input_claim_count: row.inputClaimCount,
        status: "composing",
      })
      .select("id")
      .single();
    if (error) throw new Error(`attempt insert failed: ${error.message}`);
    return data.id;
  },
  async updateAttempt(attemptId, patch) {
    if (!APPLY) {
      Object.assign(dryWrites.attempts.get(attemptId) ?? {}, patch);
      return;
    }
    const row = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.failureDetail !== undefined) row.failure_detail = patch.failureDetail;
    if (patch.composerProvider !== undefined) row.composer_provider = patch.composerProvider;
    if (patch.composerModel !== undefined) row.composer_model = patch.composerModel;
    if (patch.composerUsage !== undefined) row.composer_usage = patch.composerUsage;
    if (patch.rawComposerOutput !== undefined) row.raw_composer_output = patch.rawComposerOutput;
    if (patch.structureRefusals !== undefined) row.structure_refusals = patch.structureRefusals;
    if (patch.linkedSections !== undefined) row.linked_sections = patch.linkedSections;
    if (patch.candidateOpening !== undefined) row.candidate_opening = patch.candidateOpening;
    if (patch.candidateSections !== undefined) row.candidate_sections = patch.candidateSections;
    if (patch.candidateSha256 !== undefined) row.candidate_sha256 = patch.candidateSha256;
    if (patch.deterministicRefusals !== undefined) row.deterministic_refusals = patch.deterministicRefusals;
    if (patch.semanticRefusals !== undefined) row.semantic_refusals = patch.semanticRefusals;
    if (patch.verifierProvider !== undefined) row.verifier_provider = patch.verifierProvider;
    if (patch.verifierModel !== undefined) row.verifier_model = patch.verifierModel;
    if (patch.verifierUsage !== undefined) row.verifier_usage = patch.verifierUsage;
    if (patch.draftArticleId !== undefined) row.draft_article_id = patch.draftArticleId;
    if (patch.verifiedAt !== undefined) row.verified_at = patch.verifiedAt;
    const { error } = await db
      .from("collector_dossier_composition_attempts")
      .update(row)
      .eq("id", attemptId);
    if (error) throw new Error(`attempt update failed: ${error.message}`);
  },
  async saveDraftArticle(referenceId, draft) {
    if (!APPLY) {
      dryWrites.drafts.push(draft);
      return `dry-article-${dryWrites.drafts.length}`;
    }
    // Retire any prior machine draft — one current machine draft per
    // reference. Founder-authored drafts (no machine source note) are
    // never touched.
    const { data: priors } = await db
      .from("collector_dossier_articles")
      .select("id, source_note")
      .eq("vault_reference_id", referenceId)
      .eq("status", "draft");
    for (const prior of priors ?? []) {
      if ((prior.source_note ?? "").startsWith("machine composition attempt")) {
        await db
          .from("collector_dossier_articles")
          .update({ status: "retired" })
          .eq("id", prior.id);
      }
    }
    const { data, error } = await db
      .from("collector_dossier_articles")
      .insert({
        vault_reference_id: referenceId,
        status: "draft",
        title: draft.title,
        opening_identity: draft.openingIdentity,
        sections: draft.sections,
        source_note: draft.sourceNote,
      })
      .select("id")
      .single();
    if (error) throw new Error(`draft article insert failed: ${error.message}`);
    return data.id;
  },
};

/* ── Run ───────────────────────────────────────────────────────────────── */
console.log(`mode: ${APPLY ? "APPLY (writes attempt + draft)" : "dry (no writes)"}\n`);

const result = await runCompositionAttempt({ store, callRole: callDossierRole }, REFERENCE_ID);

console.log(`status:          ${result.status}`);
console.log(`attempt:         ${result.attemptId}`);
console.log(`claim-set hash:  ${result.claimSetHash}`);
console.log(`input claims:    ${result.inputClaimKeys.length} — ${result.inputClaimKeys.join(", ")}`);
if (result.detail) console.log(`detail:          ${result.detail}`);

for (const r of result.structureRefusals) console.log(`  STRUCTURE ${r.code} — ${r.detail}`);
for (const r of result.deterministicRefusals) console.log(`  DETERMINISTIC ${r.code} [${r.moduleId}#${r.paragraphIndex}] — ${r.detail}`);
for (const r of result.semanticRefusals) console.log(`  SEMANTIC ${r.code} [${r.moduleId}#${r.paragraphIndex}] — "${r.quote}" — ${r.why}`);

if (result.linkedSections) {
  console.log(`\n── COMPOSED ARTICLE ───────────────────────────────────────`);
  console.log(`\n${result.openingIdentity}\n`);
  for (const s of result.linkedSections) {
    console.log(`## ${s.heading}  [${s.moduleId}]`);
    for (const p of s.paragraphs) {
      console.log(`\n${p.text}`);
      console.log(`   ↳ claims: ${p.claimIds.join(", ")}`);
    }
    console.log("");
  }
}

if (result.status === "verified") {
  console.log(`candidate sha256: ${result.candidateSha256}`);
  console.log(`draft article:    ${result.draftArticleId}`);
}
process.exit(result.status === "verified" ? 0 : 1);
