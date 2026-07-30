/* ────────────────────────────────────────────────────────────────────────
   lib/formatMoney.ts — THE shared marketplace money formatter

   Marketplace Money Truth, Stage B (implementation order §8). Extracted from
   the Auction Evidence formatter in components/VaultMarketEvidence.tsx, which
   the Master Record identified as the one healthy pattern already in the
   codebase: it refuses to render an amount without its currency.

   Bare `$` retires. US$10,000 · C$10,000 · CHF 10,000 · €10,000 · ¥10,000.
   Two conventions for the same currency on one platform would be worse than
   one shared standard, so Auction Evidence adopts this too — PRESENTATION
   ONLY. Stored evidence values, CHECK constraints and the append-only
   correction chain are untouched.

   NO FX CONVERSION. Native currency displays first, always.

   LEGACY WINDOW: between Stage B deploy and the Stage C founder attestation,
   the seven existing listings carry an amount with NO currency. That is the
   expected state, not an error, and it renders as the already-locked
   undisclosed copy rather than as a bare number. Never assume USD.

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

// Relative (not the @ alias) so node test harnesses can execute this module
// directly with type stripping; identical resolution for Next.
import { currencyMeta } from "./supportedCurrencies.ts";

/** The locked undisclosed state (v2.85 Buyer Price Truth precedent). */
export const PRICE_UNDISCLOSED = "Price undisclosed";

/**
 * Render an amount with its currency, or the undisclosed state.
 *
 * Returns PRICE_UNDISCLOSED when EITHER half is missing — an amount without a
 * currency is not a price, it is a number, and rendering it as money would be
 * the exact claim this flight exists to stop.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string | null | undefined
): string {
  const meta = currencyMeta(currency);
  if (!meta) return PRICE_UNDISCLOSED;

  const n = typeof amount === "string" ? Number(amount) : amount;
  if (n === null || n === undefined || !Number.isFinite(n)) return PRICE_UNDISCLOSED;

  // Exponent drives the decimals: JPY shows none, the rest show cents only
  // when the amount actually has them.
  const hasFraction = meta.exponent > 0 && Math.round(n * 100) % 100 !== 0;
  const body = n.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? meta.exponent : 0,
    maximumFractionDigits: hasFraction ? meta.exponent : 0,
  });

  return `${meta.displayPrefix}${body}`;
}

/**
 * True when a row can be rendered as money at all. Surfaces use this to
 * choose between formatMoney and their own richer empty state.
 */
export function hasMoneyTruth(
  amount: number | string | null | undefined,
  currency: string | null | undefined
): boolean {
  return formatMoney(amount, currency) !== PRICE_UNDISCLOSED;
}
