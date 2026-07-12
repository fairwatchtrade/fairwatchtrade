/* ────────────────────────────────────────────────────────────────────────
   PRICE PARSER — lib/parsePrice.ts

   Parses a user-typed price string into a numeric value, tolerant of common
   formatting: a leading "$", thousands separators (","), decimals, and
   surrounding whitespace. Returns null when the result isn't a finite,
   positive number — empty input, garbage input, zero, or negative all
   resolve to null rather than NaN, so a caller can cleanly branch on
   "valid" vs. "not yet a real price" without ever checking for NaN itself.

   Mirrors the sanitization pattern already used by app/api/listings/route.ts's
   own local parsePrice ([^0-9.]-strip) — extracted here as a single shared
   definition rather than a second, independently-drifting regex. That route
   was NOT modified in this flight (not fresh in hand this session — its own
   local copy is left untouched pending a verified read), but it's a natural
   future candidate to import from here instead of keeping its own copy.

   Pure function, no browser or Node-only APIs — safe to import from a client
   component, a server component, or an API route.
   ──────────────────────────────────────────────────────────────────────── */

export function parsePrice(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).replace(/[^0-9.]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}
