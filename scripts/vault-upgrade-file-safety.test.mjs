/* Vault Specification Upgrade — file-safety tests against the production
   work-queue wrapper with a stub IndexedDB backing.
   Run: node scripts/vault-upgrade-file-safety.test.mjs */
import assert from "node:assert/strict";
import { createStubIndexedDb } from "./vault-upgrade-fixtures/idb-stub.mjs";
import {
  fixtureBytes,
  loadEngine,
} from "./vault-upgrade-fixtures/engine-helper.mjs";

const {
  openVaultUpgradeDb,
  intakeFile,
  saveAnalysis,
  verifyCandidateForDelivery,
  stageCandidate,
  removeWorkItem,
} = await import("../lib/vault-upgrade/indexedDb.ts");
const { engine } = await loadEngine();

let pass = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  pass++;
};
const T0 = "2026-08-05T00:00:00.000Z";

const toArrayBuffer = (buf) =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const factory = createStubIndexedDb();
const db = await openVaultUpgradeDb(factory);

// Original bytes preserved exactly through intake.
const currentBytes = fixtureBytes("current-v3.2.json");
const intake1 = await intakeFile(
  db,
  { filename: "current-v3.2.json", bytes: toArrayBuffer(currentBytes) },
  "operator@test",
  T0
);
ok("intake creates a work item", intake1.duplicate === false);
{
  const stored = await db.get(intake1.item.sourceSha256);
  ok(
    "original bytes preserved exactly",
    Buffer.compare(Buffer.from(stored.sourceBytes), currentBytes) === 0
  );
  ok("byte length recorded", stored.sourceByteLength === currentBytes.byteLength);
}

// Duplicate bytes resolve to the existing item — never a second job.
const intake2 = await intakeFile(
  db,
  { filename: "renamed-copy.json", bytes: toArrayBuffer(currentBytes) },
  "operator@test",
  T0
);
ok("duplicate bytes detected", intake2.duplicate === true);
ok(
  "duplicate resolves to the same work item",
  intake2.item.sourceSha256 === intake1.item.sourceSha256
);
{
  const all = await db.getAll();
  ok("no indistinguishable second job", all.length === 1);
  ok(
    "duplicate upload recorded with its filename",
    all[0].duplicateUploads.length === 1 &&
      all[0].duplicateUploads[0].filename === "renamed-copy.json"
  );
}

// Candidate generation and verified delivery.
const legacyBytes = fixtureBytes("legacy-reference-strings.json");
const legacyIntake = await intakeFile(
  db,
  { filename: "legacy-reference-strings.json", bytes: toArrayBuffer(legacyBytes) },
  "operator@test",
  T0
);
const record = await engine.analyzeSource({
  filename: "legacy-reference-strings.json",
  bytes: legacyBytes,
});
const candidateBytes = new TextEncoder().encode(record.candidate.text).buffer;
await saveAnalysis(db, legacyIntake.item.sourceSha256, record, candidateBytes, T0);

ok(
  "candidate filename is genuinely new",
  record.candidate.filename !== "legacy-reference-strings.json" &&
    /vault-lock-v3\.2\.[0-9a-f]{8}\.json$/.test(record.candidate.filename)
);
{
  const verified = await verifyCandidateForDelivery(
    db,
    legacyIntake.item.sourceSha256
  );
  ok("verified delivery returns the recorded filename", verified.filename === record.candidate.filename);
  ok("verified delivery hash matches", verified.sha256 === record.candidate.sha256);
  const stored = await db.get(legacyIntake.item.sourceSha256);
  ok(
    "analysis did not rewrite original bytes",
    Buffer.compare(Buffer.from(stored.sourceBytes), legacyBytes) === 0
  );
}

// Stale candidate cannot be served.
{
  const stored = await db.get(legacyIntake.item.sourceSha256);
  const tampered = Buffer.from(stored.candidateBytes);
  tampered[0] = tampered[0] ^ 0xff;
  stored.candidateBytes = toArrayBuffer(tampered);
  await db.put(stored);
  await assert.rejects(
    () => verifyCandidateForDelivery(db, legacyIntake.item.sourceSha256),
    /does not match/,
    "tampered candidate bytes must refuse delivery"
  );
  pass++;
  // restore for later tests
  stored.candidateBytes = candidateBytes;
  await db.put(stored);
}

// Malformed JSON fails honestly without corrupting the work item.
const malformedBytes = fixtureBytes("malformed.json");
const malformedIntake = await intakeFile(
  db,
  { filename: "malformed.json", bytes: toArrayBuffer(malformedBytes) },
  "operator@test",
  T0
);
{
  const r = await engine.analyzeSource({
    filename: "malformed.json",
    bytes: malformedBytes,
  });
  ok("malformed JSON → INVALID_JSON", r.status === "INVALID_JSON");
  ok("parse error reported", typeof r.parseError === "string" && r.parseError.length > 0);
  ok("no candidate for invalid JSON", r.candidate === null);
  await saveAnalysis(db, malformedIntake.item.sourceSha256, r, null, T0);
  const stored = await db.get(malformedIntake.item.sourceSha256);
  ok(
    "work item intact after failed parse",
    Buffer.compare(Buffer.from(stored.sourceBytes), malformedBytes) === 0 &&
      stored.analysis.status === "INVALID_JSON"
  );
}

// Staged items are protected from removal; unstaged items remove cleanly.
{
  await stageCandidate(db, legacyIntake.item.sourceSha256, "operator@test", T0);
  await assert.rejects(
    () => removeWorkItem(db, legacyIntake.item.sourceSha256),
    /Staged work items cannot be removed/,
    "staged item must be protected"
  );
  pass++;
  await removeWorkItem(db, malformedIntake.item.sourceSha256);
  ok(
    "unstaged item removed",
    (await db.get(malformedIntake.item.sourceSha256)) === undefined
  );
}

console.log(`vault-upgrade-file-safety: ${pass} assertions PASS`);
