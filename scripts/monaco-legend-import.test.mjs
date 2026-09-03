import fs from "node:fs";
import {
  landingSemanticDigest,
  normalizeRows,
  parseMonacoLanding,
  validateLanding,
  wantedResult,
  sameResult,
  MONACO_WEBSITE_RESULT_BASIS,
} from "./monaco-legend-import.mjs";

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) passed++;
  else { failed++; console.error(`FAIL  ${name}`); }
}
const sale = (id) => JSON.parse(fs.readFileSync(`scripts/monaco-legend/sale-${id}.sale.json`, "utf8"));
const s38 = sale("38"), s40 = sale("40"), s41 = sale("41");

check("all three versioned manifests parse", [s38, s40, s41].every((m) => m.manifest_version === 1 && m.semantic_digest_version === "monaco-landing-semantic-v1"));
check("Sale 40 session grouping is 1-110 / 111-189 / 190-288", JSON.stringify(s40.sale.sessions) === JSON.stringify([[1, 110], [111, 189], [190, 288]]));
check("Sale 40 canary pins landing 26250 and PDF contradiction 27300", s40.expected.canary.landing_price === 26250 && s40.expected.canary.pdf_price === 27300);
check("Sale 41 pins premium-result source truth", s41.sale.currency === "CHF" && JSON.stringify(s41.expected.passed) === JSON.stringify([125, 127]));

const mini = { ...s40, sale: { ...s40.sale, sessions: [[1, 1]] }, expected: { range: [1, 1], landing_lot_count: 1, landing_absent: [], no_reserve_count: 0, passed: [], withdrawn: [] }, model_overrides: {} };
const fixture = (csrf, title = "Lange 1 Time Zones, manual wristwatch, reference 116.032.") => `<meta name="csrf-token" content="${csrf}"><div>Session I Lots 1 to 1</div><section class="lot sold"><span class="lot-number">1</span><span class="lot-brand">A. Lange & Söhne</span><span class="lot-title">${title}</span><span class="lot-status-value">€ 26.250</span></section>`;
const lotsA = parseMonacoLanding(fixture("one"), mini);
const lotsB = parseMonacoLanding(fixture("two"), mini);
check("semantic digest ignores volatile CSRF/session transport", landingSemanticDigest(mini, lotsA) === landingSemanticDigest(mini, lotsB));
check("meaningful landing content changes semantic digest", landingSemanticDigest(mini, lotsA) !== landingSemanticDigest(mini, parseMonacoLanding(fixture("one", "Changed model, reference 116.032."), mini)));
check("landing parser preserves missing model/reference as null", parseMonacoLanding(fixture("x", "A description with no identifier."), mini)[0].model_text === null && parseMonacoLanding(fixture("x", "A description with no identifier."), mini)[0].reference_text === null);
check("mini source corpus validates", validateLanding(mini, fixture("x"), lotsA).length === 0);

const normalized38 = normalizeRows(s38, [{ lot_number: "63", brand_text: "Rolex", model_text: null, reference_text: null, description: null, no_reserve: false, outcome: "passed", price_realized: null }]);
const lot49 = normalized38.find((row) => row.lot_number === "49"), lot63 = normalized38.find((row) => row.lot_number === "63");
check("Sale 38 Lot 49 stays PDF-only Unsold, never a manufactured landing row", lot49?.outcome === "unsold" && lot49.source_key === "results_pdf");
check("Sale 38 Passed and PDF Unsold remain distinct evidence", lot63?.outcome === "passed" && lot63.contradictions?.[0]?.outcome === "unsold");
check("normalization output is deterministic for idempotent plan input", JSON.stringify(normalized38) === JSON.stringify(normalizeRows(s38, [{ lot_number: "63", brand_text: "Rolex", model_text: null, reference_text: null, description: null, no_reserve: false, outcome: "passed", price_realized: null }])));

/* ── v6.51 result basis, held by the adapter (v8.23) ─────────────────────
   The website shows "Result (Premium)" and never says what it is made of.
   The adapter must store the figure exactly as displayed under
   reported_result_basis_unverified, never `other`, and a current production
   row already carrying that basis must compare as reuse — the drift that
   stopped run a5c39656 on "Sale 38 Lot 1: existing result differs". */
const soldRow = { lot_number: "1", outcome: "sold", price_realized: 25000, source_key: "landing_html" };
const w38 = wantedResult(soldRow, s38.sale);
check("a sold website-result row emits reported_result_basis_unverified", w38.price_basis === "reported_result_basis_unverified" && MONACO_WEBSITE_RESULT_BASIS === "reported_result_basis_unverified");
check("the amount is stored exactly as displayed — no arithmetic", w38.price_realized === 25000 && w38.sale_outcome === "sold");
check("Sale 38 currency is the sale's currency (EUR)", w38.currency === "EUR" && s38.sale.currency === "EUR");
check("Sale 41 CHF remains CHF", wantedResult(soldRow, s41.sale).currency === "CHF" && s41.sale.currency === "CHF" && wantedResult(soldRow, s41.sale).price_basis === "reported_result_basis_unverified");
check("result date and source identity ride through unchanged", w38.result_date === s38.sale.date && w38.source_key === "landing_html");
for (const outcome of ["passed", "unsold", "withdrawn"]) {
  const r = wantedResult({ ...soldRow, outcome, price_realized: outcome === "passed" ? 26250 : null }, s38.sale);
  check(`${outcome} rows carry no invented price triplet`, r.sale_outcome === outcome && r.price_realized === null && r.currency === null && r.price_basis === null);
}

/* the production row the run tripped on, exactly as auction_evidence_result holds it */
const productionSale38Lot1 = { sale_outcome: "sold", price_realized: "25000", currency: "EUR", price_basis: "reported_result_basis_unverified" };
check("a current governed row with the same outcome/amount/currency and the v6.51 basis is REUSE, not a contradiction", sameResult(productionSale38Lot1, w38) === true);
check("a stored legacy `other` still reads as a difference — the adapter does not paper over it", sameResult({ ...productionSale38Lot1, price_basis: "other" }, w38) === false);
check("a different amount is still a contradiction", sameResult({ ...productionSale38Lot1, price_realized: "25001" }, w38) === false);
check("a different currency is still a contradiction", sameResult({ ...productionSale38Lot1, currency: "CHF" }, w38) === false);
check("a NULL production price against a sold wanted price is a contradiction, not a reuse", sameResult({ sale_outcome: "sold", price_realized: null, currency: null, price_basis: null }, w38) === false);

/* the adapter source itself cannot emit `other` for a price basis, and its
   artifact wording says what the website figure is and is not */
const adapterSource = fs.readFileSync("scripts/monaco-legend-import.mjs", "utf8");
const adapterCode = adapterSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
check("the adapter's executable source never assigns price_basis \"other\"", !/price_basis:\s*[^,\n]*"other"/.test(adapterCode) && !/"other"/.test(adapterCode.slice(adapterCode.indexOf("function wantedResult"), adapterCode.indexOf("function wantedResult") + 400)));
check("wantedResult maps sold rows through the exported constant, not a literal", /price_basis: row\.outcome === "sold" \? MONACO_WEBSITE_RESULT_BASIS : null/.test(adapterCode));
check("the landing artifact statement names Result (Premium), says the composition is unresolved, and names the governed basis",
  /Result \(Premium\)/.test(adapterSource) && /composition \(VAT basis unresolved\)/.test(adapterSource) && /reported_result_basis_unverified — no arithmetic, no VAT\/TTC\/ex-VAT inference/.test(adapterSource));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
