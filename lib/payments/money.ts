/* ════════════════════════════════════════════════════════════════════════
   PAYMENT MONEY — major units in, provider minor units out
   (Stripe Step 1 of 4, 2026-09-10)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Stripe wants cents, so multiply by 100."

   Only for currencies whose exponent is 2. JPY has none: ¥10 is `10` to
   Stripe, and ×100 would charge a hundredfold. The exponent is governed data
   in `public.supported_currencies.exponent`; this file takes it as an
   argument and never assumes it. There is no `* 100` anywhere here, and a
   test pins that absence.

   Arithmetic is done on the decimal STRING, not on a float, so 7150.10 does
   not become 715009.99999 on its way to a charge. Postgres returns numeric as
   a string; a number is accepted only after it is rendered back to a string.

   Anything that would lose precision (more fractional digits than the
   currency has) is refused rather than rounded: a rounded sale amount is a
   different sale.
   ════════════════════════════════════════════════════════════════════════ */

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

/** Provider minor-unit integer for a major-unit decimal amount. */
export function toMinorUnits(amount: string | number, exponent: number): number {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) {
    throw new Error("currency_exponent_invalid");
  }
  const text = typeof amount === "number" ? String(amount) : String(amount).trim();
  const m = DECIMAL.exec(text);
  if (!m) throw new Error("amount_not_decimal");
  const whole = m[1];
  const frac = m[2] ?? "";
  if (frac.length > exponent) {
    // e.g. 10.999 USD, or 10.5 JPY — not representable without changing the sale.
    if (/[1-9]/.test(frac.slice(exponent))) throw new Error("amount_precision_exceeds_currency");
  }
  const scaled = frac.slice(0, exponent).padEnd(exponent, "0");
  const minor = BigInt(whole) * BigInt(10) ** BigInt(exponent) + (scaled === "" ? BigInt(0) : BigInt(scaled));
  if (minor <= BigInt(0)) throw new Error("amount_not_positive");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("amount_too_large");
  return Number(minor);
}

/** Major-unit decimal string for a provider minor-unit integer (display only). */
export function fromMinorUnits(amountMinor: number, exponent: number): string {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) throw new Error("amount_minor_invalid");
  if (exponent === 0) return String(amountMinor);
  const s = String(amountMinor).padStart(exponent + 1, "0");
  return `${s.slice(0, -exponent)}.${s.slice(-exponent)}`;
}
