/* Vault Specification Upgrade — file-safety tests against the production
   work-queue wrapper with a stub IndexedDB backing.
   Run: node scripts/vault-upgrade-file-safety.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStubIndexedDb } from "./vault-upgrade-fixtures/idb-stub.mjs";
import {
  fixtureBytes,
  loadEngine,
} from "./vault-upgrade-fixtures/engine-helper.mjs";

const {
  openVaultUpgradeDb,
  intakeFile,
  saveAnalysis,
  saveCompletion,
  verifyCandidateForDelivery,
  stageCandidate,
  unstageCandidate,
  removeWorkItem,
} = await import("../lib/vault-upgrade/indexedDb.ts");
const { engine, schema, contract } = await loadEngine();

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

// A researched file's candidate must be deliverable.
//
// The analyzer only produces a candidate for a purely structural upgrade, so
// any file that needed research has analysis.candidate === null and carries
// its candidate on the completion record instead. Delivery therefore has to
// read the completion candidate. A pre-check against the analysis candidate
// silently refuses every file the room actually did work on — which is the
// entire point of the room.
{
  const { completeUpgrade } = await import("../lib/vault-upgrade/complete.ts");

  const offlineTransport = async ({ requests }) => ({
    ok: true,
    unanswered: [],
    results: requests.map((r) => ({
      path: r.path,
      outcome: "VERIFIED",
      value:
        r.kind === "variant-references"
          ? [{ reference: "FH-100-BL" }]
          : r.kind === "variant-description"
            ? "Time-only model recognised by its lacquered blue dial and slim case, produced in limited annual numbers and valued by collectors for its hand-finished movement and legible layout."
            : r.kind === "variant-notes"
              ? "38 mm steel case; manual-wind; 42h power reserve."
              : Array.isArray(r.allowedValues) && r.allowedValues.length > 0
                ? r.allowedValues[0]
                : r.field === "cluster_rationale"
                  ? "Small independent maker whose collectors follow contemporary independent watchmaking rather than heritage Swiss houses."
                  : r.field === "description"
                    ? "Independent Swiss workshop producing mechanical wristwatches in small annual series, known among collectors for hand-finished movements and a restrained house style maintained since its founding."
                    : "Switzerland",
      sources: [
        {
          title: "Fixture source",
          publisher: "Test",
          url: "https://example.org/source",
        },
      ],
      evidence: "Established by the cited source.",
      confidence: "high",
    })),
  });

  const name = "legacy-lowercase-research-gaps.json";
  const gapsBytes = fixtureBytes(name);
  const gapsIntake = await intakeFile(
    db,
    { filename: name, bytes: toArrayBuffer(gapsBytes) },
    "operator@test",
    T0
  );

  const analysis = await engine.analyzeSource({ filename: name, bytes: gapsBytes });
  ok(
    "a researched file has no analysis candidate — the precondition that broke delivery",
    analysis.candidate === null
  );
  await saveAnalysis(db, gapsIntake.item.sourceSha256, analysis, null, T0);

  const completion = await completeUpgrade({
    engine,
    schema,
    contract,
    filename: name,
    bytes: gapsBytes,
    transport: offlineTransport,
  });
  ok(
    "completion produced a candidate for the researched file",
    completion.status === "CANDIDATE_READY" && completion.candidate !== null
  );
  await saveCompletion(
    db,
    gapsIntake.item.sourceSha256,
    completion,
    new TextEncoder().encode(completion.candidate.text).buffer,
    null,
    T0
  );

  const verified = await verifyCandidateForDelivery(db, gapsIntake.item.sourceSha256);
  ok(
    "a completion-sourced candidate is deliverable",
    verified.filename === completion.candidate.filename &&
      verified.sha256 === completion.candidate.sha256
  );
}

// The room must not second-guess the verifier. This exact pre-check shipped in
// v3.90 and made every researched file undownloadable in bulk while the panel
// beside it displayed the candidate — two places deciding, one of them wrong.
{
  const room = readFileSync(
    new URL("../components/VaultSpecificationUpgrade.tsx", import.meta.url),
    "utf8"
  );
  const start = room.indexOf("async function downloadSelectedCandidates");
  const body = room.slice(start, room.indexOf("\n  async function", start + 1));
  ok(
    "bulk download found in the room",
    start > 0 && body.includes("verifyCandidateForDelivery")
  );
  ok(
    "bulk download does not pre-gate on the analysis candidate",
    !/analysis\?\.candidate/.test(body)
  );
}

// Staging must be reversible.
//
// Both removal paths refuse a staged item and tell the operator to clear
// staging first. Until unstaging existed, that instruction named an action
// the room could not perform, so a staged work item was stuck in the local
// queue permanently and the queue could never be cleaned.
{
  const before = await db.get(legacyIntake.item.sourceSha256);
  ok("the item is staged going in", before.staging !== null);

  await unstageCandidate(db, legacyIntake.item.sourceSha256, T0);
  const after = await db.get(legacyIntake.item.sourceSha256);
  ok("staging is cleared", after.staging === null);
  ok(
    "unstaging destroys nothing — candidate and analysis survive",
    after.candidateBytes !== null && after.analysis !== null
  );
  ok(
    "unstaging leaves the original bytes untouched",
    Buffer.compare(Buffer.from(after.sourceBytes), legacyBytes) === 0
  );

  await removeWorkItem(db, legacyIntake.item.sourceSha256);
  ok(
    "an unstaged item can finally be removed",
    (await db.get(legacyIntake.item.sourceSha256)) === undefined
  );
}

// Selection lifecycle. A refused removal must not cost the operator their
// selection — on a large batch, re-ticking every box was the only way to
// discover which file blocked — and a dismissed row must not linger in the
// count as a file that no longer exists.
{
  const room = readFileSync(
    new URL("../components/VaultSpecificationUpgrade.tsx", import.meta.url),
    "utf8"
  );
  const sliceOf = (name) => {
    const start = room.indexOf(`async function ${name}`);
    return start < 0 ? "" : room.slice(start, room.indexOf("\n  async function", start + 1));
  };

  const removeBody = sliceOf("removeSelected");
  ok(
    "a refused removal keeps the files that could not be removed selected",
    removeBody.length > 0 &&
      !/setSelection\(new Set\(\)\)/.test(removeBody) &&
      /setSelection\(stillSelected\)/.test(removeBody)
  );

  const dismissBody = sliceOf("dismissItem");
  ok(
    "dismiss drops its own hash from the selection",
    dismissBody.length > 0 && /\.delete\(item\.sourceSha256\)/.test(dismissBody)
  );
}

// A held run's work product is deliverable, and the two artifact kinds
// cannot be served through each other's door.
{
  const { completeUpgrade } = await import("../lib/vault-upgrade/complete.ts");
  const { verifyProvisionalForDelivery } = await import(
    "../lib/vault-upgrade/indexedDb.ts"
  );

  const held = async ({ requests }) => ({
    ok: true,
    unanswered: [],
    results: requests.map((r) => ({
      path: r.path,
      outcome: "VERIFIED",
      value:
        r.kind === "variant-references"
          ? [{ reference: "FH-200-XX" }]
          : r.kind === "variant-description"
            ? "Time-only model recognised by its lacquered blue dial and slim case, produced in limited annual numbers and valued by collectors for its hand-finished movement and legible layout."
            : r.kind === "variant-notes"
              ? "40 mm case; manual-wind."
              : Array.isArray(r.allowedValues) && r.allowedValues.length > 0
                ? r.allowedValues[0]
                : r.field === "cluster_rationale"
                  ? "Small independent maker whose collectors follow contemporary independent watchmaking rather than heritage Swiss houses."
                  : r.field === "description"
                    ? "Independent Swiss workshop producing mechanical wristwatches in small annual series, known among collectors for hand-finished movements and a restrained house style maintained since its founding."
                    : "Switzerland",
      sources: [
        { title: "Fixture source", publisher: "Test", url: "https://example.org/s" },
      ],
      evidence: "Established by the cited source.",
      confidence: "high",
    })),
  });

  const name = "taxonomy-with-research-gaps.json";
  const bytes = fixtureBytes(name);
  const intake = await intakeFile(
    db,
    { filename: name, bytes: toArrayBuffer(bytes) },
    "operator@test",
    T0
  );
  const record = await completeUpgrade({
    engine,
    schema,
    contract,
    filename: name,
    bytes,
    transport: held,
  });
  ok(
    "the fixture is genuinely held",
    record.status === "HUMAN_DECISION_REQUIRED" &&
      record.candidate === null &&
      record.provisionalCandidate !== null
  );
  await saveCompletion(
    db,
    intake.item.sourceSha256,
    record,
    null,
    new TextEncoder().encode(record.provisionalCandidate.text).buffer,
    T0
  );

  const delivered = await verifyProvisionalForDelivery(db, intake.item.sourceSha256);
  ok(
    "the held work product is deliverable",
    delivered.filename === record.provisionalCandidate.filename &&
      delivered.sha256 === record.provisionalCandidate.sha256
  );
  ok(
    "what is delivered is marked provisional",
    /\.PROVISIONAL\./.test(delivered.filename)
  );

  await assert.rejects(
    () => verifyCandidateForDelivery(db, intake.item.sourceSha256),
    /no stored candidate/,
    "a held item must not deliver through the final-candidate door"
  );
  pass++;

  const stored = await db.get(intake.item.sourceSha256);
  ok(
    "the original bytes are untouched by any of it",
    Buffer.compare(Buffer.from(stored.sourceBytes), bytes) === 0
  );

  // The reverse door: an item holding a final candidate refuses provisional
  // delivery outright, so the two states are mutually exclusive by code.
  const finalName = "legacy-empty-structures.json";
  const finalBytes = fixtureBytes(finalName);
  const finalIntake = await intakeFile(
    db,
    { filename: finalName, bytes: toArrayBuffer(finalBytes) },
    "operator@test",
    T0
  );
  const finalRecord = await engine.analyzeSource({
    filename: finalName,
    bytes: finalBytes,
  });
  ok("the control fixture has a final candidate", finalRecord.candidate !== null);
  await saveAnalysis(
    db,
    finalIntake.item.sourceSha256,
    finalRecord,
    new TextEncoder().encode(finalRecord.candidate.text).buffer,
    T0
  );
  await assert.rejects(
    () => verifyProvisionalForDelivery(db, finalIntake.item.sourceSha256),
    /holds a final candidate/,
    "a final candidate must not deliver through the provisional door"
  );
  pass++;
}

// The bulk path must deliver both classes in one operation, separated.
{
  const room = readFileSync(
    new URL("../components/VaultSpecificationUpgrade.tsx", import.meta.url),
    "utf8"
  );
  const start = room.indexOf("async function downloadSelectedCandidates");
  const body = room.slice(start, room.indexOf("\n  async function", start + 1));
  ok(
    "bulk download files final candidates under ready/",
    /ready\/\$\{/.test(body)
  );
  ok(
    "bulk download files held work under decision-required/",
    /decision-required\/\$\{/.test(body)
  );
  ok(
    "bulk download still delivers held work rather than skipping it",
    body.includes("verifyProvisionalForDelivery")
  );
  ok(
    "reports travel with the files in the same archive",
    /reports\/\$\{/.test(body)
  );
}

console.log(`vault-upgrade-file-safety: ${pass} assertions PASS`);
