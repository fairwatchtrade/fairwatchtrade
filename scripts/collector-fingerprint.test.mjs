/* Collector Fingerprint pure-derivation tests (Design Gate v2).
   The rendered treatment (no roles, no handlers, separator clipping) is
   static JSX verified in the real browser; these prove the fact derivation.
   Run: node scripts/collector-fingerprint.test.mjs */
import assert from "node:assert/strict";
import { buildCollectorFingerprint } from "../lib/collectorFingerprint.ts";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };
const eq = (n, a, b) => { assert.deepEqual(a, b, n); pass++; };

// All primary values present — Gate example order: size, thickness, movement, year.
eq("all primary facts, gate order",
  buildCollectorFingerprint(
    { caseSizeMm: "40", caseThicknessMm: "11.7", movementType: "Automatic",
      complications: ["Chronograph", "Small Seconds", "Date"] },
    "2016",
  ),
  { primary: ["40 mm case", "11.7 mm thick", "Automatic", "2016"],
    complications: ["Chronograph", "Small Seconds", "Date"] });

// Movement renders PLAIN — the v2 Gate supersedes the LD1.7 chronograph fold.
ok("chronograph never folds into movement",
  !buildCollectorFingerprint(
    { movementType: "Automatic", complications: ["Chronograph"] }, null,
  ).primary.some((f) => f.toLowerCase().includes("chronograph")));

// Missing values omit cleanly — no placeholder, no empty slot.
eq("missing thickness omits",
  buildCollectorFingerprint(
    { caseSizeMm: "40", movementType: "Automatic" }, "2016").primary,
  ["40 mm case", "Automatic", "2016"]);

// A single available value renders alone.
eq("one value renders alone",
  buildCollectorFingerprint({ movementType: "Manual Wind" }, null),
  { primary: ["Manual Wind"], complications: [] });

// A line with no values is empty (caller omits the line entirely).
eq("no facts -> both lines empty",
  buildCollectorFingerprint({}, ""),
  { primary: [], complications: [] });

// Complications line omits when empty / absent / whitespace-only.
eq("empty complications array", buildCollectorFingerprint({ complications: [] }, null).complications, []);
eq("absent complications", buildCollectorFingerprint({}, null).complications, []);
eq("whitespace complications filtered",
  buildCollectorFingerprint({ complications: [" ", "Date", ""] }, null).complications,
  ["Date"]);

// No empty separators possible: no line ever contains an empty-string fact.
const messy = buildCollectorFingerprint(
  { caseSizeMm: "  ", caseThicknessMm: null, movementType: " Quartz ", complications: ["  GMT  "] },
  "  ",
);
ok("no empty facts in primary", messy.primary.every((f) => f.trim() !== ""));
ok("no empty facts in complications", messy.complications.every((f) => f.trim() !== ""));
eq("values trimmed", messy, { primary: ["Quartz"], complications: ["GMT"] });

// Truthful stored order preserved — never re-sorted.
eq("complication order preserved",
  buildCollectorFingerprint(
    { complications: ["Date", "Chronograph", "Small Seconds"] }, null).complications,
  ["Date", "Chronograph", "Small Seconds"]);

// Long movement wording passes through untouched.
eq("long movement wording verbatim",
  buildCollectorFingerprint(
    { movementType: "Manual wind with constant-force remontoir" }, null).primary,
  ["Manual wind with constant-force remontoir"]);

console.log(`collector-fingerprint: ${pass} assertions PASS`);
