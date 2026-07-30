/* ────────────────────────────────────────────────────────────────────────
   v2 ATTESTATION ACTIVATION — TypeScript equivalence harness.

   Run:  node --experimental-strip-types scripts/v2-attestation-activation.test.mjs

   The application half of the activation proof. This file is the SINGLE
   SOURCE for the shared fixture data: the SQL harness
   (scripts/v2-attestation-activation.test.sql) creates its transaction-local
   dealer fixture with EXACTLY the field values defined here, and asserts the
   fingerprint literals this file computes and prints. If either file changes
   fixture data without the other, the literals stop matching and both
   harnesses fail loudly — the shared-fixture contract enforcing itself.

   Specimen 1 (v2 path)  — the H. Moser commercial truth, embedded base64 from
   the production row (captured 2026-07-30; disposable-target copy proven
   byte-identical by fingerprint), with USD attested.
   Specimen 2 (v1 path)  — a synthetic, transaction-local dealer fixture.
   Never the real Czapek.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

import {
  commercialFingerprint,
  commercialFingerprintV2,
  attestationFrameFor,
  isAttestationCurrent,
} from "../lib/attestation.ts";

let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL  ${label}`);
  }
}

/* ── Specimen 1 · H. Moser truth (base64 — escape-proof, captured from the
      production row; the fingerprint fields are identical on the disposable
      target, proven by matching v1/v2 fingerprints on both). ── */
const MOSER_B64 =
  "eyJpZCIgOiAiODAwODAyYzgtZTM3Zi00ZTdhLTkxOGYtNWUyYzAyYTQ5ZjQ2IiwgImJyYW5kIiA6" +
  "ICJILiBNb3NlciAmIENpZS4iLCAibW9kZWwiIDogIkVuZGVhdm91ciBDZW50cmUgU2Vjb25kcyIs" +
  "ICJyZWZlcmVuY2UiIDogIjEyMDAtMDIwMCIsICJ5ZWFyIiA6ICIyMDE5IiwgImNvbmRpdGlvbiIg" +
  "OiAiRXhjZWxsZW50IiwgImFza2luZ19wcmljZSIgOiAiMTQ0MDAiLCAiYXNraW5nX2N1cnJlbmN5" +
  "IiA6IG51bGwsICJwcm92ZW5hbmNlX25vdGUiIDogbnVsbCwgImRlc2NyaXB0aW9uIiA6ICJFbmRl" +
  "YXZvdXIgQ2VudHJlIFNlY29uZHMgd2l0aCBmdW3DqSBkaWFsLCBvZmZlcmVkIHdpdGggcHJlc2Vu" +
  "dGF0aW9uIGJveCBhbmQgbWFudWZhY3R1cmVyIGRvY3VtZW50YXRpb24uIEltcG9ydGVkIGZyb20g" +
  "ZGVhbGVyIGludmVudG9yeSDigJQgRGVhbGVyIEFjY2VsZXJhdG9yIHNlZWQgQS4iLCAiaGFzX2Jy" +
  "YWNlbGV0IiA6IGZhbHNlLCAiZGV0YWlscyIgOiB7ImF2YWlsYWJpbGl0eSI6ICJJbiBTdG9jayIs" +
  "ICJkb2N1bWVudGF0aW9uIjogIkZ1bGwgU2V0IiwgImluY2x1ZGVkV2l0aFdhdGNoIjogWyJCb3gi" +
  "LCAiUGFwZXJzIl19LCAicGhvdG9zIiA6IFt7InBob3RvIjogeyJ1cmwiOiAiaHR0cHM6Ly9lY210" +
  "aWhrYWprYnA3dWRsLnB1YmxpYy5ibG9iLnZlcmNlbC1zdG9yYWdlLmNvbS9saXN0aW5ncy8yMDI2" +
  "MDYxNl8xMTA3MjYtS2xUeFZZS2szRXpBTk1CMVBBd21XMnFFZ0dQTjlQLmpwZyIsICJwYXRobmFt" +
  "ZSI6IG51bGx9LCAiY2F0ZWdvcnkiOiBudWxsLCAiaXNXcmlzdFNob3QiOiBmYWxzZX0sIHsicGhv" +
  "dG8iOiB7InVybCI6ICJodHRwczovL2VjbXRpaGthamticDd1ZGwucHVibGljLmJsb2IudmVyY2Vs" +
  "LXN0b3JhZ2UuY29tL2xpc3RpbmdzLzIwMjYwNjE4XzIyMjI1NS1OWGZWMVRwc09rUlFQYmNIVWJr" +
  "RW43Q251MHhPbFEuanBnIiwgInBhdGhuYW1lIjogbnVsbH0sICJjYXRlZ29yeSI6IG51bGwsICJp" +
  "c1dyaXN0U2hvdCI6IGZhbHNlfV0sICJzdG9yZWRfZnAiIDogIjU3MmFjZDlhNDllMTM0ODMyZmFl" +
  "NDI1OTMyYTlkN2EzNTNiYjQ4YWRlYzRmNWE0YzFlYWU5ZDUyMTllYzMyNmEiLCAic3FsX3YyIiA6" +
  "ICI1MjRmNzVjY2FmMWVjNjNiODNlM2FlZGRjZDMxNzA5ZThmYmFiM2IyMzk5Y2U4MzIyNWViYjMz" +
  "MzI3Mjk2YTc4In0=";

const m = JSON.parse(Buffer.from(MOSER_B64, "base64").toString("utf8"));
const md = m.details ?? {};
const moserTruth = (currency) => ({
  brand: m.brand, model: m.model, reference: m.reference, year: m.year,
  condition: m.condition, asking_price: Number(m.asking_price),
  asking_currency: currency,
  provenance_note: m.provenance_note, description: m.description,
  has_bracelet: m.has_bracelet,
  details: {
    availability: md.availability,
    includedWithWatch: md.includedWithWatch,
    includedNotes: md.includedNotes,
  },
  photos: m.photos,
});

/* Known ground truth, independently proven this flight against production:
   the stored v1 stamp, and the SQL v2 output after USD attestation. */
const MOSER_STORED_V1 = "572acd9a49e134832fae425932a9d7a353bb48adec4f5a4c1eae9d5219ec326a";
const MOSER_V2_USD    = "3edd9f1c5785097e2e047496234574bb072beda43b4adb8240a6be38577123da";

/* ── Specimen 2 · the transaction-local dealer fixture (v1 path). The SQL
      harness MUST create its fixture with exactly these values. ── */
const FIXTURE = {
  brand: "Fixture Watch Co.",
  model: "Test Reference Model",
  reference: "FIX-0001",
  year: "2020",
  condition: "Excellent",
  asking_price: 5000,
  asking_currency: null,
  provenance_note: null,
  description: "Transaction-local v1 harness specimen.",
  has_bracelet: false,
  details: { availability: "In Stock", includedWithWatch: ["Box"] },
  photos: [{ photo: { url: "https://example.invalid/fixture-dial.jpg" } }],
};

/* FIXTURE_V2 is computed with USD SET — the discriminator scenario attests
   USD before resubmitting, so the v2 stamp hashes currency 'USD' in field 14,
   not an empty frame. (A null-currency v2 is unreachable from the stamp path
   by construction; computing one here would test nothing real.) */
const [moserV1, moserV2, fixtureV1, fixtureV2] = await Promise.all([
  commercialFingerprint(moserTruth(null)),
  commercialFingerprintV2(moserTruth("USD")),
  commercialFingerprint(FIXTURE),
  commercialFingerprintV2({ ...FIXTURE, asking_currency: "USD" }),
]);

check("moser: TS v1 reproduces the stored production stamp", moserV1 === MOSER_STORED_V1);
check("moser: TS v2(USD) reproduces the live SQL v2 output", moserV2 === MOSER_V2_USD);
check("moser: post-activation stamp will make attestation CURRENT",
  await isAttestationCurrent(moserTruth("USD"), moserV2));
check("moser: the old v1 stamp is NOT current under the v2 frame",
  !(await isAttestationCurrent(moserTruth("USD"), MOSER_STORED_V1)));
check("fixture: null currency selects the v1 frame", attestationFrameFor(FIXTURE.asking_currency) === "v1");
check("fixture: v1 stamp will be CURRENT for the null-currency row",
  await isAttestationCurrent(FIXTURE, fixtureV1));
check("fixture: v1 and v2 never collide", fixtureV1 !== fixtureV2);
check("fingerprints are well-formed sha256 hex",
  [moserV1, moserV2, fixtureV1, fixtureV2].every((h) => /^[0-9a-f]{64}$/.test(h)));

console.log("");
console.log("shared literals for the SQL harness (scripts/v2-attestation-activation.test.sql):");
console.log(`  MOSER_V2_USD : ${moserV2}`);
console.log(`  FIXTURE_V1   : ${fixtureV1}`);
console.log(`  FIXTURE_V2   : ${fixtureV2}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
