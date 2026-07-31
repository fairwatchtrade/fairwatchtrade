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

/** `text` is what the eye reads. `meaning` is the spoken equivalent for a
    screen reader, supplied only when the visible form uses a symbol that does
    not read aloud correctly (e.g. the ⌀ diameter sign). */
export type EnrichmentLine = { key: string; text: string; meaning?: string };

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

/** Millimetre value with at least one decimal, so a stored 30 reads "30.0",
    while a genuinely finer value keeps its precision (30.25 → "30.25"). */
function mmValue(n: number): string {
  const decimals = (String(n).split(".")[1] ?? "").length;
  return n.toFixed(Math.min(2, Math.max(1, decimals)));
}

/**
 * Movement dimensions → "⌀ 30.0 mm".
 *
 * The symbol is U+2300 DIAMETER SIGN — deliberately NOT Ø (U+00D8, a Danish
 * letter) and not ∅ (U+2205, the empty set). Screen readers do not announce it
 * usefully, so this fact also supplies a spoken `meaning`.
 *
 * Only movement_diameter_mm is certified; height and thickness are refused at
 * the database contract and ignored here. The fact type is plural so those may
 * join later without a second fact type.
 */
export function formatMovementDimensions(fact: unknown): string | null {
  if (!isObj(fact)) return null;
  const mm = posNum(fact.movement_diameter_mm);
  return mm === null ? null : `⌀ ${mmValue(mm)} mm`;
}

/** Spoken equivalent of the above — "Movement diameter, 30.0 millimetres". */
export function describeMovementDimensions(fact: unknown): string | null {
  if (!isObj(fact)) return null;
  const mm = posNum(fact.movement_diameter_mm);
  return mm === null ? null : `Movement diameter, ${mmValue(mm)} millimetres`;
}

/** Registry: fixed display order; each entry formats one canonical fact.
    `describe` is optional — present only where the visible form needs a spoken
    equivalent. */
const FACT_FORMATTERS: Array<{
  key: string;
  format: (fact: unknown) => string | null;
  describe?: (fact: unknown) => string | null;
}> = [
  { key: "beat_rate", format: formatBeatRate },
  { key: "power_reserve", format: formatPowerReserve },
  {
    key: "movement_dimensions",
    format: formatMovementDimensions,
    describe: describeMovementDimensions,
  },
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
  for (const { key, format, describe } of FACT_FORMATTERS) {
    const text = format(enrichment[key]);
    if (!text) continue;
    const meaning = describe?.(enrichment[key]) ?? null;
    out.push(meaning ? { key, text, meaning } : { key, text });
  }
  return out;
}
