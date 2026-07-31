/* Generic enrichment-fact renderer — pure derivation tests.
   Run: node scripts/vault-enrichment-facts.test.mjs */
import assert from "node:assert/strict";
import {
  formatBeatRate,
  formatPowerReserve,
  formatMovementDimensions,
  describeMovementDimensions,
  deriveEnrichmentLines,
} from "../lib/vault/enrichmentFacts.ts";

let pass = 0;
const eq = (name, a, b) => { assert.deepEqual(a, b, name); pass++; };
const ok = (name, c) => { assert.ok(c, name); pass++; };

// ── beat rate ──
eq("beat rate full", formatBeatRate({ beat_rate_vph: 36000, frequency_hz: 5 }), "36,000 vph · 5 Hz");
eq("beat rate vph only", formatBeatRate({ beat_rate_vph: 28800 }), "28,800 vph");
eq("beat rate no vph → null", formatBeatRate({ frequency_hz: 5 }), null);
eq("beat rate malformed → null", formatBeatRate({ beat_rate_vph: "36000" }), null);
eq("beat rate non-object → null", formatBeatRate(null), null);

// ── power reserve ──
eq("power reserve hours", formatPowerReserve({ power_reserve_hours: 55 }), "55 hours");
eq("power reserve 1 hour singular", formatPowerReserve({ power_reserve_hours: 1 }), "1 hour");
eq("power reserve days fallback", formatPowerReserve({ power_reserve_days: 3 }), "3 days");
eq("power reserve 1 day singular", formatPowerReserve({ power_reserve_days: 1 }), "1 day");
eq("power reserve prefers hours", formatPowerReserve({ power_reserve_hours: 72, power_reserve_days: 3 }), "72 hours");
eq("power reserve none → null", formatPowerReserve({}), null);

// ── derive lines (the real card path) ──
const sbgh201 = {
  enrichment: {
    beat_rate: {
      beat_rate_vph: 36000,
      frequency_hz: 5,
      evidence: { source_type: "manufacturer", verified: true },
    },
  },
};
eq("SBGH201 renders one beat-rate line", deriveEnrichmentLines(sbgh201), [{ key: "beat_rate", text: "36,000 vph · 5 Hz" }]);

eq("empty metadata → nothing", deriveEnrichmentLines({}), []);
eq("no enrichment key → nothing", deriveEnrichmentLines({ foo: "bar" }), []);
eq("null → nothing", deriveEnrichmentLines(null), []);
eq("malformed fact → nothing", deriveEnrichmentLines({ enrichment: { beat_rate: { beat_rate_vph: -1 } } }), []);

// both facts, fixed order (beat_rate before power_reserve)
const both = {
  enrichment: {
    power_reserve: { power_reserve_hours: 55 },
    beat_rate: { beat_rate_vph: 36000, frequency_hz: 5 },
  },
};
eq("both facts in fixed order", deriveEnrichmentLines(both), [
  { key: "beat_rate", text: "36,000 vph · 5 Hz" },
  { key: "power_reserve", text: "55 hours" },
]);

// evidence never leaked into the rendered text
const line = deriveEnrichmentLines(sbgh201)[0].text;
ok("no evidence leaked", !/manufacturer|verified|source/i.test(line));

// no hardcoded SBGH201 dependency — a different reference's data renders too
eq("generic — different value", deriveEnrichmentLines({ enrichment: { beat_rate: { beat_rate_vph: 21600, frequency_hz: 3 } } }),
  [{ key: "beat_rate", text: "21,600 vph · 3 Hz" }]);

/* ── movement_dimensions (Flight 1 gate 3) ─────────────────────────────────
   Locked contract: stored 30.0 → visible "⌀ 30.0 mm" → spoken
   "Movement diameter, 30.0 millimetres". A write that lands with no visible
   representation is NOT completion, so this gate is asserted explicitly. */
const md = { enrichment: { movement_dimensions: { movement_diameter_mm: 30.0, evidence: { verified: true } } } };

eq("movement dimensions visible form", formatMovementDimensions({ movement_diameter_mm: 30.0 }), "⌀ 30.0 mm");
eq("movement dimensions spoken form", describeMovementDimensions({ movement_diameter_mm: 30.0 }),
  "Movement diameter, 30.0 millimetres");
eq("movement dimensions full line", deriveEnrichmentLines(md), [
  { key: "movement_dimensions", text: "⌀ 30.0 mm", meaning: "Movement diameter, 30.0 millimetres" },
]);

// THE SYMBOL: U+2300 DIAMETER SIGN — never Ø (U+00D8) and never ∅ (U+2205).
const sym = formatMovementDimensions({ movement_diameter_mm: 30 }).charCodeAt(0);
eq("symbol is U+2300 DIAMETER SIGN", sym, 0x2300);
ok("symbol is NOT Ø U+00D8", sym !== 0x00d8);
ok("symbol is NOT ∅ U+2205", sym !== 0x2205);

// Precision: a stored whole number still reads with one decimal; genuine
// precision survives; nonsense is refused rather than rendered.
eq("30 renders as 30.0", formatMovementDimensions({ movement_diameter_mm: 30 }), "⌀ 30.0 mm");
eq("25.6 keeps its decimal", formatMovementDimensions({ movement_diameter_mm: 25.6 }), "⌀ 25.6 mm");
eq("30.25 keeps two decimals", formatMovementDimensions({ movement_diameter_mm: 30.25 }), "⌀ 30.25 mm");
eq("zero → null", formatMovementDimensions({ movement_diameter_mm: 0 }), null);
eq("negative → null", formatMovementDimensions({ movement_diameter_mm: -30 }), null);
eq("string value → null", formatMovementDimensions({ movement_diameter_mm: "30.0" }), null);
eq("missing field → null", formatMovementDimensions({}), null);
eq("non-object → null", formatMovementDimensions(null), null);
eq("malformed md renders nothing", deriveEnrichmentLines({ enrichment: { movement_dimensions: { movement_diameter_mm: "30" } } }), []);

// Uncertified fields are ignored by the renderer (and refused by the database).
eq("height is not rendered", formatMovementDimensions({ movement_diameter_mm: 30.0, movement_height_mm: 4.2 }), "⌀ 30.0 mm");

// Fixed display order across all three facts; only movement_dimensions carries
// a spoken form, so the existing two lines are byte-identical to before.
eq("three facts, fixed order", deriveEnrichmentLines({
  enrichment: {
    movement_dimensions: { movement_diameter_mm: 30.0 },
    power_reserve: { power_reserve_hours: 55 },
    beat_rate: { beat_rate_vph: 36000, frequency_hz: 5 },
  },
}), [
  { key: "beat_rate", text: "36,000 vph · 5 Hz" },
  { key: "power_reserve", text: "55 hours" },
  { key: "movement_dimensions", text: "⌀ 30.0 mm", meaning: "Movement diameter, 30.0 millimetres" },
]);

// Evidence never leaks into either the visible or the spoken form.
const mdLine = deriveEnrichmentLines(md)[0];
ok("no evidence leaked (visible)", !/verified|source|manufacturer/i.test(mdLine.text));
ok("no evidence leaked (spoken)", !/verified|source|manufacturer/i.test(mdLine.meaning));

// ── Precision/range alignment with the database contract (Vision review) ────
// The RPC admits only 1–100 mm with at most two decimals, and it does so
// BECAUSE this renderer uses toFixed(1..2). These assertions hold the two
// halves in agreement: every value the database accepts must survive rendering
// without loss, and the boundary values must read sensibly.
const rendered = (mm) => formatMovementDimensions({ movement_diameter_mm: mm });

eq("min bound renders", rendered(1), "⌀ 1.0 mm");
eq("max bound renders", rendered(100), "⌀ 100.0 mm");
eq("integer gains one decimal", rendered(30), "⌀ 30.0 mm");
eq("one decimal preserved", rendered(30.1), "⌀ 30.1 mm");
eq("two decimals preserved", rendered(30.25), "⌀ 30.25 mm");

// Round-trip: nothing the database accepts loses information on the way to the
// card. If this fails, the stored fact and the displayed fact have diverged.
for (const mm of [1, 1.5, 9.75, 30, 30.1, 30.25, 42.42, 99.99, 100]) {
  const text = rendered(mm);
  const back = Number.parseFloat(text.replace(/[^0-9.]/g, ""));
  ok(`round-trip ${mm} → ${text}`, back === mm);
  const spoken = describeMovementDimensions({ movement_diameter_mm: mm });
  ok(`spoken agrees ${mm}`, spoken.includes(text.replace("⌀ ", "").replace(" mm", "")));
}

// The inverse, and the two bounds are NOT the same kind of rule — asserting it
// so nobody re-conflates them (an earlier draft of this file did, and this
// assertion is what caught it).
//
// PRECISION protects rendering: past two decimals the renderer silently drops
// information, and below 0.005 it would display zero for a non-zero fact.
eq("excess precision truncates", rendered(30.12345), "⌀ 30.12 mm");
eq("sub-precision value displays as zero", rendered(0.001), "⌀ 0.00 mm");

// RANGE protects certification, not rendering: a small value renders perfectly
// well: 0.01 mm is shown faithfully. It is refused because it is not a credible
// movement diameter, which is a different failure entirely.
eq("small value still renders faithfully", rendered(0.01), "⌀ 0.01 mm");
ok("range bound is about plausibility, not display",
   rendered(0.01) === "⌀ 0.01 mm" && rendered(900) === "⌀ 900.0 mm");

console.log(`vault-enrichment-facts: ${pass} assertions PASS`);
