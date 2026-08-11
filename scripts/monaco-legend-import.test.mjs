import fs from "node:fs";
import {
  landingSemanticDigest,
  normalizeRows,
  parseMonacoLanding,
  validateLanding,
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
