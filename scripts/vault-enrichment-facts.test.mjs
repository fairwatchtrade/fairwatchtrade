/* Generic enrichment-fact renderer — pure derivation tests.
   Run: node scripts/vault-enrichment-facts.test.mjs */
import assert from "node:assert/strict";
import {
  formatBeatRate,
  formatPowerReserve,
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

console.log(`vault-enrichment-facts: ${pass} assertions PASS`);
