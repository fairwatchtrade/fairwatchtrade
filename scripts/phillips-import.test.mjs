/* Phillips Adapter Flight 1 — importer unit tests (no database, no network).
   Run: node scripts/phillips-import.test.mjs
   Optionally validates against the real pinned results PDF when
   PHILLIPS_RESULTS_PDF is set to its local path. */
import fs from "node:fs";
import crypto from "node:crypto";
import {
  extractPdfText,
  parseResultsTable,
  verifyResultsPdf,
  verifyLotPageHtml,
} from "./phillips-import.mjs";

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL  ${name}`);
  }
}

const manifest = JSON.parse(
  fs.readFileSync("scripts/phillips/ny080126-lot22.manifest.json", "utf8")
);

// ── manifest binds the exact order-pinned packet ──
check(
  "manifest pins the results-PDF hash from the order",
  manifest.packet.resultsPdf.sha256 ===
    "357c66dc52804cd3a82f7ead899fc92f189ed9fb16f14e98585cd6435702d181"
);
check(
  "manifest pins the auction-page-PDF hash from the order",
  manifest.packet.auctionPagePdf.sha256 ===
    "05267b61a7c9bae345ebc0f02679ba1f1c5b15b29730674ada3e14597021642f"
);
check("manifest pins the exact lot URL", manifest.packet.lotPageUrl === "https://www.phillips.com/detail/omega/229882");
check("manifest pins the exact auction URL", manifest.packet.auctionPageUrl === "https://www.phillips.com/auction/NY080126");
check("reviewed price is 22860 USD hammer_plus_premium", manifest.result.price_realized === 22860 && manifest.result.currency === "USD" && manifest.result.price_basis === "hammer_plus_premium");
check("39.5mmm anomaly preserved as-printed", manifest.lot.attributed_summary.includes("39.5mmm"));
check("concluded statement preserved separately", manifest.artifacts.auction_page_pdf.attribution_note.includes("Concluded Jun 14 2026"));
check("no artifact claims publication or permission", ["results_pdf", "auction_page_pdf", "lot_page"].every((k) => {
  const a = manifest.artifacts[k];
  return a.intake_method && !("permission_status" in a) && !("publication_status" in a);
}));

// ── results-table parser on a synthetic sample of the real layout ──
const sample =
  "Lot Price 21 101,600 22 22,860 23 190,500 Lot Price 121 22,860 122 48,260 " +
  "The following prices in US dollars include the buyer's premium and are rounded to the nearest dollar. " +
  "Sale Number NY080126 June 13, 2026";
const prices = parseResultsTable(sample);
check("parser reads lot 22 = 22860", prices.get("22") === 22860);
check("parser reads lot 121 = 22860 (same price, different lot)", prices.get("121") === 22860);
check("parser keeps first occurrence for duplicate lot numbers", prices.get("23") === 190500);

const v = verifyResultsPdf(sample, manifest);
check("verifyResultsPdf passes on faithful sample", v.problems.length === 0 && v.lotPrice === 22860);

const bad = verifyResultsPdf(sample.replace("22 22,860", "22 99,999"), manifest);
check("verifyResultsPdf flags a price mismatch", bad.problems.some((p) => p.includes("price mismatch")));

// ── lot-page validation on a minimal faithful fixture ──
const htmlFixture =
  '<h3>Ref. <!-- -->2998-5</h3><h3>Speedmaster</h3><span>Omega</span>' +
  "<div>Lot 22</div><a href='/auction/NY080126'>NY080126</a>";
check("verifyLotPageHtml passes on faithful fixture", verifyLotPageHtml(htmlFixture, manifest).length === 0);
check(
  "verifyLotPageHtml flags a missing reference",
  verifyLotPageHtml(htmlFixture.replace("2998-5", "1234-9"), manifest).length > 0
);

// ── optional: the REAL pinned results PDF, when available locally ──
const realPdf = process.env.PHILLIPS_RESULTS_PDF;
if (realPdf && fs.existsSync(realPdf)) {
  const buf = fs.readFileSync(realPdf);
  const hash = crypto.createHash("sha256").update(buf).digest("hex");
  check("real results PDF matches the pinned hash", hash === manifest.packet.resultsPdf.sha256);
  const text = extractPdfText(buf);
  const rv = verifyResultsPdf(text, manifest);
  check("real results PDF validates lot 22 = 22860", rv.problems.length === 0 && rv.lotPrice === 22860);
  check("real results PDF carries the premium statement", /include the buyer'?s premium/i.test(text));
} else {
  console.log("(real-PDF checks skipped — set PHILLIPS_RESULTS_PDF to run them)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
