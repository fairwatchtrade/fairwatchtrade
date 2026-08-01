/* ════════════════════════════════════════════════════════════════════════
   MOVEMENT FREQUENCY — digits in, presentation out

   The seller types digits only: 28000. FairWatchTrade displays it back as
   "28,000 vph". The comma and the unit are presentation formatting — never
   typed by the seller, never stored as part of the numeric value.

   ── THE Hz RULE ────────────────────────────────────────────────────────
   The Hz equivalent appears ONLY when it is exact. Hz = vph / 7200 (a full
   oscillation is two beats). 28,800 → 4 Hz, shown. 25,200 → 3.5 Hz, shown.
   19,800 → 2.75 Hz, shown. 28,000 → 3.888… Hz — NOT shown, because
   truncating it to "3.9 Hz" would put a wrong number beside a right one.
   The cutoff is two exact decimals, which covers every legitimate watch
   frequency and excludes every rounding.

   ── LEGACY VALUES ──────────────────────────────────────────────────────
   Stored values are heterogeneous — older drafts and imports carry strings
   like "28,800 vph (4 Hz)". The parser extracts the FIRST number group
   (never a naive digit-strip, which would read 288004 out of that string),
   so legacy values re-format cleanly and formatting is idempotent. A value
   with no plausible vph number passes through untouched: this formatter
   presents, it never invents or destroys.
   ════════════════════════════════════════════════════════════════════════ */

/** Plausible mechanical-watch beat range. Outside it we do not pretend to
    understand the value — it renders as the seller wrote it. */
const VPH_MIN = 3600;
const VPH_MAX = 100000;

/** First number group, comma-tolerant: "28,800 vph (4 Hz)" → 28800. */
export function parseVph(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;
  const m = raw.match(/\d[\d,]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n) || n < VPH_MIN || n > VPH_MAX) return null;
  return n;
}

/** Digits-only canonical form for STORAGE — what the input writes. */
export function vphInputDigits(raw: string): string {
  const n = parseVph(raw);
  if (n !== null) return String(n);
  // Not yet a plausible number (mid-typing): keep bare digits so the seller
  // can continue, never letting commas or units into the stored value.
  return raw.replace(/\D/g, "").slice(0, 6);
}

/** Presentation: "28,000 vph", plus " (4 Hz)" only when exact. */
export function formatMovementFrequency(raw: string | null | undefined): string {
  const n = parseVph(raw);
  if (n === null) return typeof raw === "string" ? raw : "";
  const vph = n.toLocaleString("en-US");
  const hz = n / 7200;
  const hz2 = Math.round(hz * 100);
  // exact to two decimals — 4, 3.5, 2.75 qualify; 3.888… does not
  if (Math.abs(hz * 100 - hz2) < 1e-9) {
    const hzText = (hz2 / 100).toString();
    return `${vph} vph (${hzText} Hz)`;
  }
  return `${vph} vph`;
}
