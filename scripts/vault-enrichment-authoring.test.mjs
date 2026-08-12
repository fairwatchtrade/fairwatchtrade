/* ════════════════════════════════════════════════════════════════════════
   VAULT ENRICHMENT AUTHORING — contract tests (VE01–VE18)
   Run: node --experimental-strip-types scripts/vault-enrichment-authoring.test.mjs

   The room's whole value is that its output is consumable by the ALREADY
   PROVEN apply path. These tests assert that faithfulness, and assert the two
   real-world evidence traps found in "validated" packs are refused.

   Pure. No network, no database, no repository mutation.
   ════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const {
  APPLY_SCRIPT_FACT_TYPES,
  ENRICHMENT_FACT_TYPES,
  buildEnrichmentPlan,
  buildEvidence,
  getFactDefinition,
  planFileName,
} = await import("../lib/vault/enrichmentAuthoring.ts");

let pass = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  pass++;
};

const IDENTITY = {
  reference_id: "d3c1ff04-23a4-40ce-858a-0481cc60fe7c",
  reference: "SBGH201",
  brand: { id: "c461facb-f1d0-4f23-a00a-b71cc1139d04", name: "Grand Seiko", slug: "grand-seiko" },
  collection: { id: "b66a9886-5b1e-4aee-9bf1-a88e9dc9151b", name: "Heritage Collection" },
  family: { id: "d8cac747-bb8f-44a0-97a8-2042f6f5874b", name: "Heritage Hi-Beat" },
  variant: { id: "4a195564-dcd0-4c8e-9866-f9d1f81afef7", name: "Mount Iwate White Dial" },
};

const GOOD_EVIDENCE = {
  source_type: "manufacturer",
  source_name: "Grand Seiko — SBGH201 official product page",
  source_url: "https://www.grand-seiko.com/sg-en/collections/sbgh201g",
  date_accessed: "2026-07-21",
  excerpt: "Mechanical Hi-Beat 36000; Caliber no.: 9S85.",
  verified: true,
};

const buildBeatRate = (over = {}) =>
  buildEnrichmentPlan({
    identity: IDENTITY,
    factType: "beat_rate",
    values: { beat_rate_vph: 36000, frequency_hz: 5 },
    evidence: GOOD_EVIDENCE,
    existingMetadata: {},
    expectedEnv: "aqgjcezhdoianqmoknnu",
    appliedBy: "vault-enrichment-room",
    ...over,
  });

/* ── VE01 · the happy path is an IMPORT with a hashable file ───────────── */
{
  const p = buildBeatRate();
  ok("VE01 classification is IMPORT", p.classification === "IMPORT");
  ok("VE01 a plan file is produced", typeof p.planJson === "string" && p.planJson.length > 0);
  ok("VE01 no problems", p.problems.length === 0);
}

/* ── VE02 · the hash is the SHA-256 of the emitted bytes, uppercase ────── */
{
  const p = buildBeatRate();
  const expected = createHash("sha256").update(p.planJson, "utf8").digest("hex").toUpperCase();
  ok("VE02 hash matches the emitted bytes exactly", p.planSha256Upper === expected);
  ok("VE02 hash is 64 uppercase hex", /^[0-9A-F]{64}$/.test(p.planSha256Upper));
}

/* ── VE03 · the plan is what validatePlan() requires ───────────────────── */
{
  const p = buildBeatRate();
  const arr = JSON.parse(p.planJson);
  ok("VE03 plan is an array", Array.isArray(arr));
  ok("VE03 exactly one record", arr.length === 1);
  const r = arr[0];
  ok("VE03 classification IMPORT", r.classification === "IMPORT");
  ok("VE03 import_authorized true", r.import_authorized === true);
  ok("VE03 diagnostic_only false", r.diagnostic_only === false);
  ok(
    "VE03 resolved_identity complete",
    Boolean(r.resolved_identity?.reference_id && r.resolved_identity?.reference && r.resolved_identity?.brand?.name)
  );
  ok("VE03 proposed_fact_payload present", r.proposed_fact_payload && typeof r.proposed_fact_payload === "object");
}

/* ── VE04 · THE FAITHFULNESS TEST — the apply script rebuilds the payload
      from `incoming` and refuses on mismatch. Rebuild it the same way. ──── */
{
  const p = buildBeatRate();
  const r = JSON.parse(p.planJson)[0];
  const def = getFactDefinition(r.fact_type);
  const rebuilt = def.buildPayload(r.incoming, buildEvidence(r.incoming));
  ok(
    "VE04 payload rebuilt from `incoming` deep-equals the stored payload",
    JSON.stringify(rebuilt) === JSON.stringify(r.proposed_fact_payload)
  );
}

/* ── VE05 · evidence envelope is the exact six fields ──────────────────── */
{
  const p = buildBeatRate();
  const ev = JSON.parse(p.planJson)[0].proposed_fact_payload.evidence;
  ok(
    "VE05 six evidence keys, no more",
    JSON.stringify(Object.keys(ev).sort()) ===
      JSON.stringify(["date_accessed", "excerpt", "source_name", "source_type", "source_url", "verified"])
  );
  ok("VE05 verified is boolean true", ev.verified === true);
}

/* ── VE06 · the placeholder-URL trap is refused ────────────────────────── */
{
  for (const url of [
    "https://example.com/replace-with-real-source",
    "http://www.example.com/x",
    "https://example.org/a",
    "http://localhost:3000/x",
  ]) {
    const p = buildBeatRate({ evidence: { ...GOOD_EVIDENCE, source_url: url } });
    ok(
      `VE06 refused placeholder host: ${url}`,
      p.classification !== "IMPORT" && p.problems.some((x) => x.includes("placeholder host"))
    );
  }
}

/* ── VE07 · the prose-source trap is refused ───────────────────────────── */
{
  for (const name of ["Verified Independent Source", "verified independent source", "Official Source", "Manufacturer"]) {
    const p = buildBeatRate({ evidence: { ...GOOD_EVIDENCE, source_name: name } });
    ok(
      `VE07 refused prose source_name: ${name}`,
      p.classification !== "IMPORT" && p.problems.some((x) => x.includes("not a source"))
    );
  }
}

/* ── VE08 · every evidence field is genuinely required ─────────────────── */
{
  for (const field of ["source_type", "source_name", "source_url", "date_accessed", "excerpt"]) {
    const p = buildBeatRate({ evidence: { ...GOOD_EVIDENCE, [field]: "" } });
    ok(
      `VE08 missing ${field} refuses the plan`,
      p.classification !== "IMPORT" && p.problems.some((x) => x.includes(field))
    );
  }
}

/* ── VE09 · unverified is never applyable ──────────────────────────────── */
{
  const p = buildBeatRate({ evidence: { ...GOOD_EVIDENCE, verified: false } });
  ok("VE09 verified:false refuses", p.classification !== "IMPORT");
  ok("VE09 and says why", p.problems.some((x) => x.includes("verified")));
}

/* ── VE10 · whitespace-only evidence is not evidence ───────────────────── */
{
  const p = buildBeatRate({ evidence: { ...GOOD_EVIDENCE, excerpt: "    " } });
  ok("VE10 whitespace-only excerpt refuses", p.classification !== "IMPORT");
}

/* ── VE11 · date must be ISO ───────────────────────────────────────────── */
{
  const p = buildBeatRate({ evidence: { ...GOOD_EVIDENCE, date_accessed: "21/07/2026" } });
  ok("VE11 non-ISO date refuses", p.classification !== "IMPORT");
}

/* ── VE12 · beat rate must be internally consistent ────────────────────── */
{
  const bad = buildBeatRate({ values: { beat_rate_vph: 36000, frequency_hz: 4 } });
  ok("VE12 inconsistent vph/Hz refuses", bad.classification !== "IMPORT");
  ok("VE12 and names the identity", bad.problems.some((x) => x.includes("7200")));
  const good = buildBeatRate({ values: { beat_rate_vph: 28800, frequency_hz: 4 } });
  ok("VE12 consistent 28800/4 is accepted", good.classification === "IMPORT");
}

/* ── VE13 · a case diameter cannot masquerade as a movement ────────────── */
{
  const p = buildEnrichmentPlan({
    identity: IDENTITY, factType: "movement_dimensions",
    values: { movement_diameter_mm: 40.0 },
    evidence: GOOD_EVIDENCE, existingMetadata: {},
    expectedEnv: "aqgjcezhdoianqmoknnu", appliedBy: "vault-enrichment-room",
  });
  ok("VE13 a 40mm 'movement' is refused", p.classification !== "IMPORT");
  ok("VE13 and names the real risk", p.problems.some((x) => x.toUpperCase().includes("CASE")));
  const good = buildEnrichmentPlan({
    identity: IDENTITY, factType: "movement_dimensions",
    values: { movement_diameter_mm: 30.0 },
    evidence: GOOD_EVIDENCE, existingMetadata: {},
    expectedEnv: "aqgjcezhdoianqmoknnu", appliedBy: "vault-enrichment-room",
  });
  ok("VE13 the real PF703 value 30.0 is accepted", good.classification === "IMPORT");
}

/* ── VE14 · an existing fact is never silently overwritten ─────────────── */
{
  const existing = { enrichment: { beat_rate: { beat_rate_vph: 36000, frequency_hz: 5 } } };
  const same = buildBeatRate({ existingMetadata: existing });
  ok("VE14 identical existing values → SKIP", same.classification === "SKIP");
  ok("VE14 SKIP emits no plan", same.planJson === null);

  const differing = buildBeatRate({
    existingMetadata: { enrichment: { beat_rate: { beat_rate_vph: 28800, frequency_hz: 4 } } },
  });
  ok("VE14 differing existing values → CONFLICT", differing.classification === "CONFLICT");
  ok("VE14 CONFLICT emits no plan", differing.planJson === null);
  ok(
    "VE14 and refuses to decide the overwrite",
    differing.problems.some((x) => x.includes("separate, authorized decision"))
  );
}

/* ── VE15 · unrelated metadata and sibling facts survive the merge ─────── */
{
  const p = buildBeatRate({
    existingMetadata: {
      some_other_root_key: { keep: true },
      enrichment: { power_reserve: { power_reserve_hours: 72, power_reserve_days: null } },
    },
  });
  const meta = JSON.parse(p.planJson)[0].proposed_metadata;
  ok("VE15 unrelated root key preserved", meta.some_other_root_key?.keep === true);
  ok("VE15 sibling fact preserved", meta.enrichment.power_reserve?.power_reserve_hours === 72);
  ok("VE15 new fact added", meta.enrichment.beat_rate?.beat_rate_vph === 36000);
}

/* ── VE16 · the SQL carries the hash and defaults to a dry run ─────────── */
{
  const p = buildBeatRate();
  ok("VE16 sql names the RPC", p.sql.includes("public.enrich_vault_reference("));
  for (const param of [
    "p_reference_id", "p_manufacturer", "p_reference", "p_fact_type", "p_payload",
    "p_computed_hash", "p_authorized_hash", "p_expected_env", "p_applied_by", "p_dry_run",
  ]) {
    ok(`VE16 sql passes ${param}`, p.sql.includes(param));
  }
  ok("VE16 sql defaults to a dry run", /p_dry_run\s*=>\s*true/.test(p.sql));
  ok("VE16 sql carries the computed hash", p.sql.includes(p.planSha256Upper));
  ok("VE16 sql pins the environment", p.sql.includes("aqgjcezhdoianqmoknnu"));
}

/* ── VE17 · SQL literals are escaped ───────────────────────────────────── */
{
  const p = buildEnrichmentPlan({
    identity: { ...IDENTITY, brand: { ...IDENTITY.brand, name: "O'Hara & Sons" } },
    factType: "beat_rate",
    values: { beat_rate_vph: 28800, frequency_hz: 4 },
    evidence: GOOD_EVIDENCE, existingMetadata: {},
    expectedEnv: "aqgjcezhdoianqmoknnu", appliedBy: "vault-enrichment-room",
  });
  ok("VE17 single quotes are doubled", p.sql.includes("'O''Hara & Sons'"));
}

/* ── VE18 · the script's narrower allowlist is told the truth ──────────── */
{
  const beat = buildBeatRate();
  ok("VE18 beat_rate offers the CLI path", beat.appliesWithScript === true && typeof beat.cliCommand === "string");
  ok("VE18 CLI command carries the hash", beat.cliCommand.includes(beat.planSha256Upper));
  const md = buildEnrichmentPlan({
    identity: IDENTITY, factType: "movement_dimensions",
    values: { movement_diameter_mm: 30 },
    evidence: GOOD_EVIDENCE, existingMetadata: {},
    expectedEnv: "aqgjcezhdoianqmoknnu", appliedBy: "vault-enrichment-room",
  });
  ok("VE18 movement_dimensions offers no CLI command", md.appliesWithScript === false && md.cliCommand === null);
  ok("VE18 but still emits SQL", typeof md.sql === "string");
  ok(
    "VE18 the allowlist matches the apply script exactly",
    JSON.stringify([...APPLY_SCRIPT_FACT_TYPES].sort()) === JSON.stringify(["beat_rate", "power_reserve"])
  );
  ok(
    "VE18 the room offers exactly the database's three fact types",
    JSON.stringify([...ENRICHMENT_FACT_TYPES].sort()) ===
      JSON.stringify(["beat_rate", "movement_dimensions", "power_reserve"])
  );
  ok("VE18 plan file name is derived from the reference", planFileName("SBGH201", "beat_rate") === "sbgh201-beat_rate-import-plan.json");
}

console.log(`\n${pass} passed, 0 failed`);
