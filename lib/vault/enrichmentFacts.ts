/* ════════════════════════════════════════════════════════════════════════
   VAULT ENRICHMENT FACTS — read-time presentation (Vault Enrichment v2.73)

   Pure, generic derivation of the compact value lines a Vault reference card
   shows for verified enrichment facts. Composed DIRECTLY from canonical
   metadata.enrichment at read time — no stored card copy, no reference-specific
   logic, no sample fallback. A fact that is absent or malformed yields NOTHING
   (no penalty for missing data — only a penalty for bad data). The evidence
   envelope is never exposed on the compact card.

   One renderer serves every fact. Beat rate → "36,000 vph · 5 Hz".
   Power reserve → "55 hours". Order is fixed and fact-driven, not per-reference.
   ════════════════════════════════════════════════════════════════════════ */

export type EnrichmentLine = { key: string; text: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Finite, positive number or null (rejects strings, NaN, ≤0). */
function posNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function intGroup(n: number): string {
  return n.toLocaleString("en-US");
}

/** "36,000 vph · 5 Hz" — vph required; Hz optional. Null if no valid vph. */
export function formatBeatRate(fact: unknown): string | null {
  if (!isObj(fact)) return null;
  const vph = posNum(fact.beat_rate_vph);
  if (vph === null) return null;
  const hz = posNum(fact.frequency_hz);
  return hz === null ? `${intGroup(vph)} vph` : `${intGroup(vph)} vph · ${hz} Hz`;
}

/** "55 hours" (prefers hours; falls back to days). Singular/plural aware. */
export function formatPowerReserve(fact: unknown): string | null {
  if (!isObj(fact)) return null;
  const hours = posNum(fact.power_reserve_hours);
  if (hours !== null) return `${intGroup(hours)} ${hours === 1 ? "hour" : "hours"}`;
  const days = posNum(fact.power_reserve_days);
  if (days !== null) return `${intGroup(days)} ${days === 1 ? "day" : "days"}`;
  return null;
}

/** Registry: fixed display order; each entry formats one canonical fact. */
const FACT_FORMATTERS: Array<{ key: string; format: (fact: unknown) => string | null }> = [
  { key: "beat_rate", format: formatBeatRate },
  { key: "power_reserve", format: formatPowerReserve },
];

/**
 * Derive the compact value lines from a reference's metadata. Reads only
 * metadata.enrichment.<fact>; skips anything absent or malformed. Never throws.
 */
export function deriveEnrichmentLines(metadata: unknown): EnrichmentLine[] {
  if (!isObj(metadata)) return [];
  const enrichment = metadata.enrichment;
  if (!isObj(enrichment)) return [];
  const out: EnrichmentLine[] = [];
  for (const { key, format } of FACT_FORMATTERS) {
    const text = format(enrichment[key]);
    if (text) out.push({ key, text });
  }
  return out;
}
