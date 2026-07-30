/* ────────────────────────────────────────────────────────────────────────
   lib/parsePrice.ts — THE governed marketplace money parser

   Marketplace Money Truth, Stage B (implementation order §7). One contract,
   one implementation, every application call site.

   WHAT THIS REPLACES AND WHY. The previous parser was
   `String(raw).replace(/[^0-9.]/g, "")` — strip everything but digits and
   dots — cloned across four more sites. It does not fail on international
   notation, it SILENTLY CORRUPTS it:

       €12.000   → 12        a 1000x error, reported as success
       1.200,50  → 1.2005    a 1000x error, reported as success
       £12,000   → 12000     currency discarded, then rendered as dollars

   The old guard caught only *unparseable* input. Wrongly-parseable input is
   the dangerous class, and it passed with no warning. Decision 7 of the
   locked Master Record: ambiguous notation must FAIL VISIBLY.

   THE CONTRACT
   · The caller supplies the currency. This parser NEVER infers currency from
     a symbol — inferring is how £12,000 became $12,000.
   · Accepts plain digits, correctly grouped thousands, at most one decimal
     point, and decimals within the selected currency's exponent.
   · Rejects, with a machine-readable reason: embedded symbols or letters,
     multiple decimal points, ambiguous grouping (the proven €10.000 case),
     malformed grouping, ranges, negatives, and zero.
   · Returns the raw text alongside the amount so a caller cannot forget to
     preserve it — on create AND on edit (closes the raw-staleness bug).

   Canary: PFC274 = 62 — /api/evaluate untouched.
   ──────────────────────────────────────────────────────────────────────── */

// Relative (not the @ alias) so node test harnesses can execute this module
// directly with type stripping; identical resolution for Next.
import { currencyMeta, type CurrencyCode } from "./supportedCurrencies.ts";

export type PriceRejection =
  | "empty"
  | "unsupported_currency"
  | "contains_symbol_or_letter"
  | "multiple_decimal_points"
  | "ambiguous_grouping"
  | "malformed_grouping"
  | "range_not_supported"
  | "negative_not_supported"
  | "zero_not_allowed"
  | "too_many_decimal_places";

export type PriceParseResult =
  | { ok: true; amount: number; raw: string; currency: CurrencyCode }
  | { ok: false; reason: PriceRejection; raw: string; message: string };

const MESSAGES: Record<PriceRejection, string> = {
  empty: "Enter an asking price.",
  unsupported_currency: "Choose a currency before entering a price.",
  contains_symbol_or_letter:
    "Enter digits only — no currency symbols or letters. Pick the currency from the selector.",
  multiple_decimal_points: "That price has more than one decimal point.",
  ambiguous_grouping:
    "That price is ambiguous — 12.000 could mean twelve or twelve thousand. Write it as 12000 or 12000.00.",
  malformed_grouping: "Check the thousands separators — for example 1,200.50.",
  range_not_supported: "Enter a single price, not a range.",
  negative_not_supported: "A price cannot be negative.",
  zero_not_allowed: "A price must be greater than zero.",
  too_many_decimal_places: "That currency does not use that many decimal places.",
};

/** Grouped thousands: 1,200 · 12,000 · 1,234,567 — leading group 1-3 digits. */
const GROUPED = /^\d{1,3}(,\d{3})+$/;
const PLAIN = /^\d+$/;

/**
 * Parse a seller-entered price against a known currency.
 * The currency is REQUIRED and is never inferred from the input text.
 */
export function parsePrice(
  raw: string | number | null | undefined,
  currency: CurrencyCode | string | null | undefined
): PriceParseResult {
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  const reject = (reason: PriceRejection): PriceParseResult => ({
    ok: false,
    reason,
    raw: text,
    message: MESSAGES[reason],
  });

  const meta = currencyMeta(currency);
  if (!meta) return reject("unsupported_currency");
  if (text === "") return reject("empty");

  // Ranges first: "1000-2000" / "1000 to 2000" would otherwise read as stray
  // characters and produce a misleading reason.
  if (/\d\s*(?:-|–|—|\bto\b|\.\.)\s*\d/i.test(text)) {
    return reject("range_not_supported");
  }
  if (text.startsWith("-")) return reject("negative_not_supported");

  // Anything not a digit, comma or dot. Catches $ € £ ¥, CHF, USD, k, m.
  if (/[^\d.,]/.test(text)) return reject("contains_symbol_or_letter");

  const dots = (text.match(/\./g) ?? []).length;
  const commas = (text.match(/,/g) ?? []).length;
  if (dots > 1) return reject("multiple_decimal_points");

  let intPart: string;
  let fracPart = "";

  if (dots === 1) {
    const [before, after] = text.split(".");
    // "12.000" — a dot followed by exactly three digits, no comma anywhere.
    // THE ambiguous case: European thousands, or a US decimal? We refuse to
    // guess. This is the €12.000 → 12 bug, closed.
    if (commas === 0 && after.length === 3) return reject("ambiguous_grouping");
    intPart = before;
    fracPart = after;
  } else {
    intPart = text;
  }

  if (intPart === "") return reject("malformed_grouping");
  if (commas > 0) {
    if (!GROUPED.test(intPart)) return reject("malformed_grouping");
    intPart = intPart.replace(/,/g, "");
  } else if (!PLAIN.test(intPart)) {
    return reject("malformed_grouping");
  }

  if (fracPart !== "" && !PLAIN.test(fracPart)) return reject("malformed_grouping");
  // JPY has exponent 0: 1000.50 yen is not a representable amount.
  if (fracPart.length > meta.exponent) return reject("too_many_decimal_places");

  const amount = Number(fracPart === "" ? intPart : `${intPart}.${fracPart}`);
  if (!Number.isFinite(amount)) return reject("malformed_grouping");
  if (amount === 0) return reject("zero_not_allowed");
  if (amount < 0) return reject("negative_not_supported");

  return { ok: true, amount, raw: text, currency: meta.code };
}
