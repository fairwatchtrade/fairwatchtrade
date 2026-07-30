/* ────────────────────────────────────────────────────────────────────────
   lib/supportedCurrencies.ts — generated mirror of public.supported_currencies

   Marketplace Money Truth, Stage B. This is the CLIENT-SIDE MIRROR of the
   Stage A metadata table. It exists so the parser can enforce a currency's
   exponent and the formatter can render its prefix without a round trip.

   EXTENSION LAW (recorded v2.95): the curated nine live in more than one
   place by design. Adding a currency requires the metadata row, all four
   column CHECK constraints, THIS mirror, parser and formatter fixtures, and
   the harness to move together in one deliberate act. A row added to the
   table alone yields a currency listed as supported but rejected everywhere —
   visible and inert rather than silently wrong.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

export type CurrencyCode =
  | "USD" | "CAD" | "EUR" | "GBP" | "CHF" | "JPY" | "AUD" | "SGD" | "HKD";

export type CurrencyMeta = {
  code: CurrencyCode;
  /** ISO 4217 minor units. JPY is 0; every other launch currency is 2. */
  exponent: number;
  /** Concatenated verbatim by formatMoney — CHF carries its own space. */
  displayPrefix: string;
  displayName: string;
};

export const SUPPORTED_CURRENCIES: readonly CurrencyMeta[] = [
  { code: "USD", exponent: 2, displayPrefix: "US$",  displayName: "United States Dollar" },
  { code: "CAD", exponent: 2, displayPrefix: "C$",   displayName: "Canadian Dollar" },
  { code: "EUR", exponent: 2, displayPrefix: "€",    displayName: "Euro" },
  { code: "GBP", exponent: 2, displayPrefix: "£",    displayName: "Pound Sterling" },
  { code: "CHF", exponent: 2, displayPrefix: "CHF ", displayName: "Swiss Franc" },
  { code: "JPY", exponent: 0, displayPrefix: "¥",    displayName: "Japanese Yen" },
  { code: "AUD", exponent: 2, displayPrefix: "A$",   displayName: "Australian Dollar" },
  { code: "SGD", exponent: 2, displayPrefix: "S$",   displayName: "Singapore Dollar" },
  { code: "HKD", exponent: 2, displayPrefix: "HK$",  displayName: "Hong Kong Dollar" },
] as const;

/** USD is the visible "Recommended" default when a seller has no preference.
    It is never silently persisted to the profile — only the settings surface
    writes the preference (Master Record §5 item 5). */
export const RECOMMENDED_CURRENCY: CurrencyCode = "USD";

const BY_CODE = new Map<string, CurrencyMeta>(
  SUPPORTED_CURRENCIES.map((c) => [c.code, c])
);

export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === "string" && BY_CODE.has(code);
}

/** Returns null for anything outside the curated set — callers must handle it
    rather than assume USD. Assuming is exactly the bug this flight closes. */
export function currencyMeta(code: unknown): CurrencyMeta | null {
  return typeof code === "string" ? BY_CODE.get(code) ?? null : null;
}
