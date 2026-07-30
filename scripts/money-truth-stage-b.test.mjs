/* ────────────────────────────────────────────────────────────────────────
   MONEY TRUTH STAGE B — application-side fixture harness.

   Run:  node --experimental-strip-types scripts/money-truth-stage-b.test.mjs

   Covers the implementation order's §17 parser fixture list in full, the §8
   formatter launch behaviors, the §10 v1/v2 attestation frame rules, and the
   §12 unsupported-price-search meanings. The SQL half of the shared-fixture
   contract lives in scripts/money-truth-stage-b.test.sql and runs against a
   DISPOSABLE production-derived target — never production. The two files
   assert the same outcomes (the nine-code set, rejection of a tenth code,
   non-restrictive price intent, v1≠v2 separation); equivalence is matching
   behavior, not duplicated logic — the SQL side has no price parser at all,
   by design.

   PFC274 = 62 — the evaluate route is untouched.
   ──────────────────────────────────────────────────────────────────────── */

import { parsePrice } from "../lib/parsePrice.ts";
import { formatMoney, hasMoneyTruth, PRICE_UNDISCLOSED } from "../lib/formatMoney.ts";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "../lib/supportedCurrencies.ts";
import {
  attestationFrameFor,
  canonicalCommercialTruth,
  canonicalCommercialTruthV2,
  commercialFingerprint,
  commercialFingerprintV2,
  isAttestationCurrent,
} from "../lib/attestation.ts";
import { parseSearch, matchesMeaning, matchesSearch } from "../lib/search/parse.ts";

let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL  ${label}`);
  }
}

/* ═══ §17 parser fixtures — the order's list, verbatim, plus edges ═══ */

// "$1,200.50" — embedded symbol REFUSED (the caller supplies currency;
// symbols in the text are exactly how £12,000 once became $12,000).
check("parser: $1,200.50 refused (symbol in text)", (() => {
  const r = parsePrice("$1,200.50", "USD");
  return !r.ok && r.reason === "contains_symbol_or_letter";
})());

// "1200.50" — plain accepted.
check("parser: 1200.50 → 1200.5", (() => {
  const r = parsePrice("1200.50", "USD");
  return r.ok && r.amount === 1200.5 && r.raw === "1200.50";
})());

// "€12.000" — the proven 1000x corruption, now a visible refusal.
check("parser: €12.000 refused (symbol), never 12", (() => {
  const r = parsePrice("€12.000", "EUR");
  return !r.ok;
})());
check("parser: 12.000 refused as ambiguous, never 12", (() => {
  const r = parsePrice("12.000", "EUR");
  return !r.ok && r.reason === "ambiguous_grouping";
})());

// "1.200,50" — European decimal comma refused, never 1.2005.
check("parser: 1.200,50 refused, never 1.2005", (() => {
  const r = parsePrice("1.200,50", "EUR");
  return !r.ok;
})());

// "£12,000" — refused; currency comes from the selector, not the text.
check("parser: £12,000 refused (symbol in text)", (() => {
  const r = parsePrice("£12,000", "GBP");
  return !r.ok && r.reason === "contains_symbol_or_letter";
})());

check("parser: malformed grouping 1,20,000 refused", (() => {
  const r = parsePrice("1,20,000", "USD");
  return !r.ok && r.reason === "malformed_grouping";
})());
check("parser: range 1000-2000 refused", (() => {
  const r = parsePrice("1000-2000", "USD");
  return !r.ok && r.reason === "range_not_supported";
})());
check("parser: null refused as empty", (() => {
  const r = parsePrice(null, "USD");
  return !r.ok && r.reason === "empty";
})());
check("parser: zero refused", (() => {
  const r = parsePrice("0", "USD");
  return !r.ok && r.reason === "zero_not_allowed";
})());
check("parser: negative refused", (() => {
  const r = parsePrice("-5", "USD");
  return !r.ok && r.reason === "negative_not_supported";
})());
check("parser: excess decimals 10.1234 refused (USD exponent 2)", (() => {
  const r = parsePrice("10.1234", "USD");
  return !r.ok && r.reason === "too_many_decimal_places";
})());
// The three-decimal case reads as POSSIBLE European thousands — the ambiguity
// rule outranks the exponent rule because it is the truer refusal.
check("parser: 10.123 refused as ambiguous (rule ordering)", (() => {
  const r = parsePrice("10.123", "USD");
  return !r.ok && r.reason === "ambiguous_grouping";
})());
check("parser: grouped 1,200.123 refused by exponent", (() => {
  const r = parsePrice("1,200.123", "USD");
  return !r.ok && r.reason === "too_many_decimal_places";
})());

// JPY exponent behavior — no minor units at all.
check("parser: JPY rejects 1000.50", (() => {
  const r = parsePrice("1000.50", "JPY");
  return !r.ok && r.reason === "too_many_decimal_places";
})());
check("parser: JPY accepts 1000", (() => {
  const r = parsePrice("1000", "JPY");
  return r.ok && r.amount === 1000;
})());

// Currency is never inferred and never optional.
check("parser: null currency refused", !parsePrice("1000", null).ok);
check("parser: unknown currency refused", !parsePrice("1000", "XYZ").ok);
check("parser: grouped thousands accepted, raw preserved", (() => {
  const r = parsePrice(" 1,234,567 ", "USD");
  return r.ok && r.amount === 1234567 && r.raw === "1,234,567";
})());

/* ═══ §8 formatter launch behaviors ═══ */

check("format: US$10,000", formatMoney(10000, "USD") === "US$10,000");
check("format: C$10,000", formatMoney(10000, "CAD") === "C$10,000");
check("format: CHF 10,000 (own space)", formatMoney(10000, "CHF") === "CHF 10,000");
check("format: €10,000", formatMoney(10000, "EUR") === "€10,000");
check("format: ¥10,000 no decimals", formatMoney(10000, "JPY") === "¥10,000");
check("format: cents render when present", formatMoney(1200.5, "USD") === "US$1,200.50");
check("format: amount without currency is undisclosed", formatMoney(4200, null) === PRICE_UNDISCLOSED);
check("format: currency without amount is undisclosed", formatMoney(null, "USD") === PRICE_UNDISCLOSED);
check("format: hasMoneyTruth gates both halves", hasMoneyTruth(4200, "USD") && !hasMoneyTruth(4200, null));

/* ═══ curated set — one deliberate act to extend (mirrors the SQL rows) ═══ */

const NINE = ["USD", "CAD", "EUR", "GBP", "CHF", "JPY", "AUD", "SGD", "HKD"];
check("currencies: exactly the locked nine", (() => {
  const codes = SUPPORTED_CURRENCIES.map((c) => c.code);
  return codes.length === 9 && NINE.every((c) => codes.includes(c));
})());
check("currencies: JPY exponent 0, all others 2",
  SUPPORTED_CURRENCIES.every((c) => c.exponent === (c.code === "JPY" ? 0 : 2)));
check("currencies: a tenth code is not supported", !isSupportedCurrency("NZD"));

/* ═══ §10 attestation frames — v1/v2 rules on a synthetic truth ═══ */

const truth = {
  brand: "Parmigiani Fleurier",
  model: "Tonda",
  reference: "PFC274-0000600-HC3142",
  year: "2016",
  condition: "Excellent",
  asking_price: 11111.11,
  asking_currency: null,
  provenance_note: null,
  description: "fumé", // non-ASCII exercises the UTF-8 byte-length framing
  has_bracelet: false,
  details: { availability: "In Stock", includedWithWatch: ["Box", "Papers"] },
  photos: [{ photo: { url: "https://x/dial.jpg" } }, { photo: { url: "  " } }],
};
const withUsd = { ...truth, asking_currency: "USD" };

check("attest: null currency selects v1 frame", attestationFrameFor(null) === "v1");
check("attest: whitespace currency selects v1 frame", attestationFrameFor("  ") === "v1");
check("attest: USD selects v2 frame", attestationFrameFor("USD") === "v2");
check("attest: v2 canonical = v2 frame + v1 canonical + currency frame",
  canonicalCommercialTruthV2(withUsd) === `2:v2${canonicalCommercialTruth(withUsd)}3:USD`);

const [fpV1, fpV2, fpV2chf, fpV2edit] = await Promise.all([
  commercialFingerprint(withUsd),
  commercialFingerprintV2(withUsd),
  commercialFingerprintV2({ ...withUsd, asking_currency: "CHF" }),
  commercialFingerprintV2({ ...withUsd, asking_price: 11111.12 }),
]);
check("attest: v1 ≠ v2 on identical fields", fpV1 !== fpV2);
check("attest: currency edit changes v2", fpV2 !== fpV2chf);
check("attest: amount edit changes v2", fpV2 !== fpV2edit);
check("attest: legacy null-currency row keeps its v1 attestation",
  await isAttestationCurrent(truth, await commercialFingerprint(truth)));
check("attest: setting currency invalidates the stored v1 (re-attestation required)",
  !(await isAttestationCurrent(withUsd, await commercialFingerprint(truth))));

/* ═══ §12 unsupported price-search honesty ═══ */

const LABEL = "Price search isn't available yet";
const listing = {
  brand: "Parmigiani Fleurier",
  model: "Tonda",
  reference: "PFC274-0000600-HC3142",
  details: { caseMaterial: "Stainless Steel", caseSizeMm: "40" },
};

check("search: $12,000 becomes the visible unsupported-price criterion", (() => {
  const s = parseSearch("parmigiani $12,000");
  return (
    s.meanings.some((m) => m.kind === "unsupportedPrice" && m.label === LABEL) &&
    s.meanings.some((m) => m.kind === "brand")
  );
})());
check("search: under $5k recognized", parseSearch("under $5k").meanings[0]?.kind === "unsupportedPrice");
check("search: between $5,000 and $8,000 consumed whole", (() => {
  const s = parseSearch("between $5,000 and $8,000");
  const priced = s.meanings.filter((m) => m.kind === "unsupportedPrice");
  return priced.length === 1 && !s.meanings.some((m) => m.kind === "text");
})());
check("search: 12000 usd recognized", parseSearch("12000 usd").meanings[0]?.kind === "unsupportedPrice");
check("search: price under 5000 recognized",
  parseSearch("price under 5000").meanings[0]?.kind === "unsupportedPrice");
check("search: price intent is NON-restrictive (no silent zero-result)", (() => {
  const s = parseSearch("parmigiani $12,000");
  return matchesSearch(listing, s);
})());
check("search: unsupportedPrice meaning alone matches everything",
  matchesMeaning(listing, { kind: "unsupportedPrice", value: "$12,000", label: LABEL, source: ["$12,000"] }));
check("search: under 40mm is STILL case size, not price", (() => {
  const s = parseSearch("under 40mm");
  return s.meanings[0]?.kind === "caseSizeMaxMm" && !s.meanings.some((m) => m.kind === "unsupportedPrice");
})());
check("search: a bare number stays ordinary text (no guessing)", (() => {
  const s = parseSearch("5000");
  return s.meanings.every((m) => m.kind === "text");
})());
check("search: 28,800 vph beat rate is untouched by price rules", (() => {
  const s = parseSearch(">=28,800 vph");
  return s.meanings[0]?.kind === "beatRateMin" && !s.meanings.some((m) => m.kind === "unsupportedPrice");
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
