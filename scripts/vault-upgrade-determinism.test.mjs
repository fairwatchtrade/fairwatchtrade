/* Vault Specification Upgrade — determinism contract tests.
   Run: node scripts/vault-upgrade-determinism.test.mjs */
import assert from "node:assert/strict";
import {
  fixtureBytes,
  loadEngine,
} from "./vault-upgrade-fixtures/engine-helper.mjs";

const { engine, schema, specText, verifyActiveContract, createUpgradeEngine } =
  await loadEngine();
let pass = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  pass++;
};

// Repeat analysis of identical bytes is byte-identical everywhere.
{
  const bytes = fixtureBytes("legacy-reference-strings.json");
  const a = await engine.analyzeSource({ filename: "legacy-reference-strings.json", bytes });
  const b = await engine.analyzeSource({ filename: "legacy-reference-strings.json", bytes });
  ok("repeat analysis record identical", JSON.stringify(a) === JSON.stringify(b));
  ok("candidate text byte-identical", a.candidate.text === b.candidate.text);
  ok("candidate SHA-256 stable", a.candidate.sha256 === b.candidate.sha256);
  ok("ledger SHA-256 stable", a.candidate.ledgerSha256 === b.candidate.ledgerSha256);
  ok("status identical", a.status === b.status);
  ok(
    "counts identical",
    JSON.stringify(a.counts) === JSON.stringify(b.counts)
  );
  ok(
    "candidate filename deterministic",
    a.candidate.filename === b.candidate.filename &&
      a.candidate.filename.includes("vault-lock-v3.2")
  );
  // No runtime timestamps in the deterministic payload.
  ok(
    "no timestamps in analysis record",
    !/T\d{2}:\d{2}:\d{2}/.test(JSON.stringify(a))
  );
}

// The four required hashes are present and well-formed.
{
  const bytes = fixtureBytes("legacy-empty-structures.json");
  const r = await engine.analyzeSource({ filename: "legacy-empty-structures.json", bytes });
  const hex64 = /^[0-9a-f]{64}$/;
  ok("source_sha256 recorded", hex64.test(r.sourceSha256));
  ok("specification_sha256 recorded", hex64.test(r.specificationSha256));
  ok("candidate_sha256 recorded", hex64.test(r.candidate.sha256));
  ok("change_ledger_sha256 recorded", hex64.test(r.candidate.ledgerSha256));
}

// Active-contract mismatch blocks candidate generation entirely.
{
  const tampered = await verifyActiveContract(specText + "x", schema);
  ok("tampered spec fails verification", tampered.ok === false && tampered.code === "ACTIVE_CONTRACT_MISMATCH");
  const blockedEngine = createUpgradeEngine(schema, tampered);
  const r = await blockedEngine.analyzeSource({
    filename: "legacy-empty-structures.json",
    bytes: fixtureBytes("legacy-empty-structures.json"),
  });
  ok("analysis under mismatch → ACTIVE_CONTRACT_MISMATCH", r.status === "ACTIVE_CONTRACT_MISMATCH");
  ok("no candidate under mismatch", r.candidate === null);
}

// Schema-companion tamper also fails the binding.
{
  const tamperedSchema = { ...schema, title: "tampered" };
  const result = await verifyActiveContract(specText, tamperedSchema);
  ok(
    "tampered schema companion fails verification",
    result.ok === false && result.code === "ACTIVE_CONTRACT_MISMATCH"
  );
}

console.log(`vault-upgrade-determinism: ${pass} assertions PASS`);
