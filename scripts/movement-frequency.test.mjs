/* Movement frequency — digits in, presentation out, Hz only when exact.

   Run: node --experimental-strip-types scripts/movement-frequency.test.mjs

   The rule worth testing hardest: 28,000 vph divided by 7200 is 3.888… Hz.
   Showing "3.9 Hz" would put a wrong number beside a right one, so the Hz
   note appears ONLY when it is exact to two decimals — which covers every
   legitimate watch frequency (4, 3.5, 3, 2.75, 5) and excludes every
   rounding. */
import assert from "node:assert/strict";
import {
  formatMovementFrequency,
  parseVph,
  vphInputDigits,
} from "../lib/movementFrequency.ts";

let n = 0;
const ok = (name) => console.log(`  PASS ${++n}  ${name}`);

/* ── 1 · The order's own example ────────────────────────────────────── */
assert.equal(formatMovementFrequency("28000"), "28,000 vph");
assert.equal(
  formatMovementFrequency("28000").includes("Hz"),
  false,
  "3.888… Hz is not exact — it must not be shown"
);
ok('28000 → "28,000 vph" — no invented Hz');

/* ── 2 · Exact frequencies carry their Hz ───────────────────────────── */
assert.equal(formatMovementFrequency("28800"), "28,800 vph (4 Hz)");
assert.equal(formatMovementFrequency("21600"), "21,600 vph (3 Hz)");
assert.equal(formatMovementFrequency("25200"), "25,200 vph (3.5 Hz)");
assert.equal(formatMovementFrequency("19800"), "19,800 vph (2.75 Hz)");
assert.equal(formatMovementFrequency("36000"), "36,000 vph (5 Hz)");
ok("4, 3, 3.5, 2.75 and 5 Hz — every exact equivalent is shown");

/* ── 3 · Legacy stored strings re-format cleanly, never mangle ───────
   A naive digit-strip would read 288004 out of "28,800 vph (4 Hz)". The
   parser takes the FIRST number group, so old rows and old drafts render
   identically to new ones — and formatting is idempotent. */
assert.equal(formatMovementFrequency("28,800 vph (4 Hz)"), "28,800 vph (4 Hz)");
assert.equal(formatMovementFrequency("28,800 vph"), "28,800 vph (4 Hz)");
assert.equal(parseVph("28,800 vph (4 Hz)"), 28800);
assert.equal(
  formatMovementFrequency(formatMovementFrequency("28000")),
  "28,000 vph",
  "formatting must be idempotent"
);
ok("legacy formatted values parse by first number group — 288004 can never happen");

/* ── 4 · The input stores digits only ───────────────────────────────── */
assert.equal(vphInputDigits("28000"), "28000");
assert.equal(vphInputDigits("28,800 vph (4 Hz)"), "28800", "editing a legacy value cleans it");
assert.equal(vphInputDigits("28k"), "28", "mid-typing junk reduces to bare digits");
assert.equal(vphInputDigits(""), "");
assert.equal(vphInputDigits("vph"), "");
ok("the stored value is digits only — comma and unit never enter the draft");

/* ── 5 · Junk passes through, honestly ──────────────────────────────
   The formatter presents; it never invents or destroys. */
assert.equal(formatMovementFrequency("fast"), "fast");
assert.equal(formatMovementFrequency(""), "");
assert.equal(formatMovementFrequency(null), "");
assert.equal(formatMovementFrequency(undefined), "");
assert.equal(formatMovementFrequency("999999"), "999999", "implausible numbers are left alone");
assert.equal(parseVph("100"), null, "below any real beat rate — not claimed as vph");
ok("unparseable or implausible values render as the seller wrote them");

console.log(`\n  ${n}/${n} passed — the comma and the unit are presentation, never data.\n`);
