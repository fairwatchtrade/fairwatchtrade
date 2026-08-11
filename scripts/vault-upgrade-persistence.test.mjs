/* Vault Specification Upgrade — persistence and batch-behavior tests.
   The stub factory persists across close/reopen, proving resume with the
   exact production wrapper and filter code.
   Run: node scripts/vault-upgrade-persistence.test.mjs */
import assert from "node:assert/strict";
import { createStubIndexedDb } from "./vault-upgrade-fixtures/idb-stub.mjs";
import {
  fixtureBytes,
  loadEngine,
} from "./vault-upgrade-fixtures/engine-helper.mjs";

const { openVaultUpgradeDb, intakeFile, saveAnalysis, stageCandidate } =
  await import("../lib/vault-upgrade/indexedDb.ts");
const { filterWorkItems, filterCounts } = await import(
  "../lib/vault-upgrade/filters.ts"
);
const { buildZip, buildChangeReport, serializeReport, reportFilename } =
  await import("../lib/vault-upgrade/reports.ts");
const { engine, contract } = await loadEngine();

let pass = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  pass++;
};
const T0 = "2026-08-05T00:00:00.000Z";
const toArrayBuffer = (buf) =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const factory = createStubIndexedDb();

// Session 1 — intake and analyze a realistic mixed batch.
{
  const db = await openVaultUpgradeDb(factory);
  const files = [
    "current-v3.2.json",
    "legacy-reference-strings.json",
    "legacy-lowercase-research-gaps.json",
    "lifecycle-conflict.json",
    "unsupported-fields.json",
    "malformed.json",
  ];
  for (const name of files) {
    const bytes = fixtureBytes(name);
    const { item } = await intakeFile(
      db,
      { filename: name, bytes: toArrayBuffer(bytes) },
      "operator@test",
      T0
    );
    const record = await engine.analyzeSource({ filename: name, bytes });
    const candidateBytes = record.candidate
      ? new TextEncoder().encode(record.candidate.text).buffer
      : null;
    await saveAnalysis(db, item.sourceSha256, record, candidateBytes, T0);
  }
  // Duplicate re-upload of identical bytes.
  await intakeFile(
    db,
    {
      filename: "current-v3.2-copy.json",
      bytes: toArrayBuffer(fixtureBytes("current-v3.2.json")),
    },
    "operator@test",
    T0
  );
  // Stage the one item with a candidate.
  const all = await db.getAll();
  const ready = all.find((i) => i.analysis?.status === "STRUCTURAL_UPGRADE_READY");
  await stageCandidate(db, ready.sourceSha256, "operator@test", T0);
  db.close();
}

// Session 2 — reopen: everything must resume exactly.
const db = await openVaultUpgradeDb(factory);
const items = await db.getAll();
ok("all six work items resumed after close/reopen", items.length === 6);

const statusOf = (name) =>
  items.find((i) => i.sourceFilename === name)?.analysis?.status;
ok("no-change status resumed", statusOf("current-v3.2.json") === "CURRENT_SPEC_NO_CHANGE");
ok("ready status resumed", statusOf("legacy-reference-strings.json") === "STRUCTURAL_UPGRADE_READY");
ok("research status resumed", statusOf("legacy-lowercase-research-gaps.json") === "RESEARCH_REQUIRED");
ok("decision status resumed", statusOf("lifecycle-conflict.json") === "DECISION_REQUIRED");
ok("blocked status resumed", statusOf("unsupported-fields.json") === "BLOCKED");
ok("invalid status resumed", statusOf("malformed.json") === "INVALID_JSON");

const readyItem = items.find((i) => i.sourceFilename === "legacy-reference-strings.json");
ok("staging state resumed", readyItem.staging !== null);
ok(
  "staging preserved hashes and truthful status",
  readyItem.staging.candidateSha256 === readyItem.analysis.candidate.sha256 &&
    readyItem.staging.statusAtStaging === "STRUCTURAL_UPGRADE_READY" &&
    readyItem.staging.specificationSha256 === contract.identity.specificationSha256
);
ok(
  "duplicate re-upload resumed on the same item",
  items.find((i) => i.sourceFilename === "current-v3.2.json").duplicateUploads
    .length === 1
);

// Status filter counts derive from the same code the room runs.
const counts = filterCounts(items);
ok("count: all", counts.get("all") === 6);
ok("count: nochange", counts.get("nochange") === 1);
ok("count: ready", counts.get("ready") === 1);
ok("count: research", counts.get("research") === 1);
ok("count: decision", counts.get("decision") === 1);
ok("count: blocked", counts.get("blocked") === 1);
ok("count: invalid", counts.get("invalid") === 1);
ok("count: duplicate", counts.get("duplicate") === 1);
ok("count: staged", counts.get("staged") === 1);

// Filtered select-all: selection equals the filtered set exactly.
{
  const filtered = filterWorkItems(items, "research", "");
  const selection = new Set(filtered.map((i) => i.sourceSha256));
  ok(
    "select-all-filtered selects exactly the filtered items",
    selection.size === 1 &&
      filtered[0].sourceFilename === "legacy-lowercase-research-gaps.json"
  );
  const searched = filterWorkItems(items, "all", "fixture horlogerie");
  ok(
    "brand search matches analyzed brand names",
    searched.length >= 5 && searched.every((i) => i.analysis?.brandName === "Fixture Horlogerie")
  );
}

// Staging never converts a warning into success.
{
  const research = items.find(
    (i) => i.analysis?.status === "RESEARCH_REQUIRED"
  );
  await assert.rejects(
    () => stageCandidate(db, research.sourceSha256, "operator@test", T0),
    /no stored candidate/,
    "a file without a candidate cannot be staged"
  );
  pass++;
}

// Batch candidate ZIP and batch report ZIP.
{
  const candidateEntries = items
    .filter((i) => i.analysis?.candidate)
    .map((i) => ({
      filename: i.analysis.candidate.filename,
      content: i.candidateBytes,
    }));
  const zip1 = await buildZip(candidateEntries);
  ok(
    "candidate ZIP is a real archive",
    zip1 instanceof Uint8Array && zip1[0] === 0x50 && zip1[1] === 0x4b
  );
  const reportEntries = items
    .filter((i) => i.analysis)
    .map((i) => {
      const report = buildChangeReport(
        contract.identity,
        {
          filename: i.sourceFilename,
          sha256: i.sourceSha256,
          byteLength: i.sourceByteLength,
        },
        i.analysis
      );
      return { filename: reportFilename(report), content: serializeReport(report) };
    });
  const zip2 = await buildZip(reportEntries);
  ok("report ZIP is a real archive", zip2[0] === 0x50 && zip2[1] === 0x4b);
  ok("report ZIP covers all analyzed items", reportEntries.length === 6);
  const zip1b = await buildZip(candidateEntries);
  ok(
    "ZIP output is deterministic for identical inputs",
    Buffer.compare(Buffer.from(zip1), Buffer.from(zip1b)) === 0
  );
}

// A failed retry must not destroy what an earlier run finished.
{
  const { wouldDiscardCompletedWork } = await import(
    "../lib/vault-upgrade/filters.ts"
  );
  const artifact = { filename: "x.json", text: "{}", sha256: "a", ledgerSha256: "b", byteLength: 2 };
  const done = { status: "CANDIDATE_READY", candidate: artifact, provisionalCandidate: null };
  const held = { status: "HUMAN_DECISION_REQUIRED", candidate: null, provisionalCandidate: artifact };
  const failure = { status: "FAILED_RETRYABLE", candidate: null, provisionalCandidate: null };

  ok(
    "a failed retry never overwrites a finished candidate",
    wouldDiscardCompletedWork(done, failure) === true
  );
  ok(
    "a failed retry never overwrites a held work product either",
    wouldDiscardCompletedWork(held, failure) === true
  );
  ok(
    "a provider-authorization failure is treated the same way",
    wouldDiscardCompletedWork(done, {
      ...failure,
      status: "BLOCKED_PROVIDER_AUTHORIZATION",
    }) === true
  );
  /* Only a failure that produced nothing is refused. Real results always
     supersede, or a file could never be improved by a second run. */
  ok(
    "a successful rerun still supersedes the previous result",
    wouldDiscardCompletedWork(done, done) === false
  );
  ok(
    "a rerun that yields a held work product still supersedes",
    wouldDiscardCompletedWork(done, held) === false
  );
  ok(
    "a first run has nothing to protect",
    wouldDiscardCompletedWork(null, failure) === false
  );
  ok(
    "a previous run that produced nothing is not worth protecting",
    wouldDiscardCompletedWork(failure, failure) === false
  );
  ok(
    "a decision-required result carrying no artifact does not block a rerun",
    wouldDiscardCompletedWork(
      { status: "HUMAN_DECISION_REQUIRED", candidate: null, provisionalCandidate: null },
      failure
    ) === false
  );
}

console.log(`vault-upgrade-persistence: ${pass} assertions PASS`);
