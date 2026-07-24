/* Phillips sale batch importer — automated proofs (no network; DB via an
   in-memory fake). Run: node scripts/phillips-sale-import.test.mjs
   Real-source checks activate when PHILLIPS_RESULTS_PDF and
   PHILLIPS_SALE_HTML point at the pinned local files. */
import fs from "node:fs";
import crypto from "node:crypto";
import {
  parseSaleTiles,
  parseResultsTotal,
  joinSaleFacts,
  buildSalePlanObject,
  planToBytes,
  applySalePlan,
} from "./phillips-sale-import.mjs";
import { extractPdfText, parseResultsTable } from "./phillips-import.mjs";

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) pass++;
  else {
    fail++;
    console.log(`FAIL  ${name}`);
  }
};
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

const saleManifest = JSON.parse(fs.readFileSync("scripts/phillips/ny080126.sale.json", "utf8"));

// [1] exact PDF hash enforcement is pinned in the manifest
check("manifest pins results-PDF hash", saleManifest.resultsPdf.sha256 === "357c66dc52804cd3a82f7ead899fc92f189ed9fb16f14e98585cd6435702d181");
check("manifest pins auction-page-PDF hash", saleManifest.auctionPagePdf.sha256 === "05267b61a7c9bae345ebc0f02679ba1f1c5b15b29730674ada3e14597021642f");
check("manifest carries no lot list (generated, never hand-typed)", !("lots" in saleManifest));

// ── tile-parser fixture: three tiles, one without a reference ──
const tile = (lot, maker, ref, model) =>
  `seldon-object-tile__lot-number seldon-text--headingSmall">${lot}</span>` +
  `<span class="seldon-text seldon-object-tile__maker seldon-text--headingSmall"><div class="pah-html-parser"><span>${maker}</span></div></span>` +
  (ref ? `<span class="seldon-text seldon-object-tile__reference-number seldon-text--headingExtraSmall">Ref. ${ref}</span>` : "") +
  `<span class="seldon-text seldon-object-tile__model seldon-text--headingExtraSmall"><div class="pah-html-parser"><span>${model}</span></div></span>` +
  `<span class="seldon-text--labelSmall">Estimate</span><span>$10,000–20,000</span>`;
const fixtureHtml = "<html>" + tile("1", "F.P. Journe", "", "Chronom&#x27;tre") + tile("2", "Omega", "2998-5", "Speedmaster") + tile("4", "R&amp;D Co", "X-1", "Proto") + "</html>";

const tiles = parseSaleTiles(fixtureHtml);
check("fixture parses 3 tiles", tiles.length === 3);
check("[6] missing reference preserved as null", tiles[0].reference_text === null);
check("entities decoded in maker", tiles[2].brand_text === "R&D Co");
check("[14] no estimate text enters parsed facts", !JSON.stringify(tiles).includes("10,000"));

// ── join fixtures ──
const fixtureExpected = { lotCount: 3, absentLotNumbers: ["3"], totalSoldIncludingPremium: 600 };
const goodPrices = new Map([["1", 100], ["2", 200], ["4", 300]]);
const joined = joinSaleFacts(tiles, goodPrices, fixtureExpected);
check("[4] exact join produces 3 rows, no problems", joined.rows.length === 3 && joined.problems.length === 0);
check("[5] absent lot number 3 is proven absent", !joined.rows.some((r) => r.lot_number === "3"));
check("reconciliation total matches", joined.total === 600);

const dupJoin = joinSaleFacts([...tiles, tiles[1]], goodPrices, fixtureExpected);
check("[7] duplicate lot rejected", dupJoin.problems.some((p) => p.includes("duplicate")));

const badTotal = joinSaleFacts(tiles, new Map([["1", 100], ["2", 200], ["4", 999]]), fixtureExpected);
check("[8] conflicting price fails reconciliation", badTotal.problems.some((p) => p.includes("reconciliation FAILED")));

const absentViolation = joinSaleFacts(tiles, new Map([...goodPrices, ["3", 5]]), { ...fixtureExpected, lotCount: 3 });
check("[5b] a price for an absent lot is rejected, not silently skipped", absentViolation.problems.some((p) => p.includes("should be absent")));

// ── [9] deterministic plan bytes ──
const live = {
  houseId: "H",
  saleId: "S",
  resultsPdfArtifactId: "A-R",
  auctionPagePdfArtifactId: "A-P",
  estimatesOmissionPresent: true,
  lotsByNumber: new Map([["2", { id: "L2", brand_text: "Omega", model_text: "Speedmaster", reference_text: "2998-5" }]]),
  currentResultsByLot: new Map([["2", { id: "R2", sale_outcome: "sold", price_realized: 200, currency: "USD", price_basis: "hammer_plus_premium" }]]),
};
const mkPlan = () =>
  buildSalePlanObject({ saleManifest, saleManifestHash: "MH", joined, salePageSha256: "PH", live });
const p1 = planToBytes(mkPlan());
const p2 = planToBytes(mkPlan());
check("[9] byte-identical plan from byte-identical inputs", p1 === p2);

const plan = mkPlan();
plan.resultDefaults = saleManifest.result_defaults;
check("[11] canary lot classified as reuse", plan.lots.find((l) => l.lot_number === "2").lotAction === "reuse" && plan.lots.find((l) => l.lot_number === "2").resultAction === "reuse");
check("pre-apply classification counts", plan.summary.lotCreates === 2 && plan.summary.lotReuses === 1 && plan.summary.contradictions === 0);

// ── [10] plan-hash binding is enforced by apply CLI (verified structurally):
check("[10] plan carries manifest hash for binding", plan.saleManifestHash === "MH");

// ── fake supabase for apply/resume proofs ──
function fakeDb() {
  const lots = new Map(); // key lot_number
  const results = new Map(); // key lot id -> result
  let idc = 0;
  const nid = (p) => `${p}${++idc}`;
  return {
    lots,
    results,
    from(table) {
      const q = { table, filters: {}, _select: null };
      const runLots = () =>
        [...lots.values()].filter(
          (l) =>
            (!("sale_id" in q.filters) || l.sale_id === q.filters.sale_id) &&
            (!("lot_number" in q.filters) || l.lot_number === q.filters.lot_number) &&
            (!("id" in q.filters) || l.id === q.filters.id)
        );
      const runResults = () =>
        [...results.values()].filter(
          (r) =>
            (!("lot_id" in q.filters) || r.lot_id === q.filters.lot_id) &&
            (!("is_current" in q.filters) || r.is_current === q.filters.is_current)
        );
      const exec = () => {
        if (table === "profiles") return q.filters.id === "REV" ? [{ id: "REV" }] : [];
        if (table === "auction_evidence_lot") return runLots();
        if (table === "auction_evidence_result") return runResults();
        if (table === "auction_evidence_source_artifact") return [{ omission_statement: "x estimates are deliberately not captured" }];
        return [];
      };
      const chain = {
        select() { return chain; },
        eq(k, v) { q.filters[k] = v; return chain; },
        in() { return chain; },
        single() { const rows = exec(); return Promise.resolve(rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "not single" } }); },
        then(res) { res({ data: exec(), error: null }); },
        insert(values) {
          return {
            select() {
              return {
                single() {
                  if (table !== "auction_evidence_lot") return Promise.resolve({ data: null, error: { message: "insert not allowed" } });
                  if ([...lots.values()].some((l) => l.lot_number === values.lot_number))
                    return Promise.resolve({ data: null, error: { message: "duplicate key" } });
                  const row = { id: nid("L"), ...values };
                  lots.set(row.id, row);
                  return Promise.resolve({ data: row, error: null });
                },
              };
            },
          };
        },
        update() { return { eq() { return Promise.resolve({ error: null }); } }; },
      };
      return chain;
    },
    rpc(name, args) {
      if (name !== "auction_evidence_create_or_correct_result")
        return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
      const existing = [...results.values()].find((r) => r.lot_id === args.p_lot_id && r.is_current);
      if (existing) return Promise.resolve({ data: null, error: { message: "one current per lot" } });
      const row = {
        id: nid("R"), lot_id: args.p_lot_id, is_current: true,
        sale_outcome: args.p_sale_outcome, price_realized: args.p_price_realized,
        currency: args.p_currency, price_basis: args.p_price_basis,
      };
      results.set(row.id, row);
      return Promise.resolve({ data: row, error: null });
    },
  };
}

const applyPlanFixture = () => {
  const p = mkPlan();
  p.resultDefaults = saleManifest.result_defaults;
  p.reviewerUid = "REV";
  p.artifactMetadataSteps = [];
  // fresh DB has nothing: even the "reuse" lot must be creatable on a fake
  for (const l of p.lots) { delete l.existingLotId; delete l.existingResultId; }
  return p;
};

// [13] interrupted apply resumes without duplicates or second-current results
{
  const db = fakeDb();
  const p = applyPlanFixture();
  const first = await applySalePlan(p, db, { stopAfter: 1 });
  check("interrupted apply reports last successful lot", first.interrupted === true && first.lastLot === "1");
  const second = await applySalePlan(p, db);
  check("[13] resume completes without duplicates", second.interrupted === false && db.lots.size === 3 && db.results.size === 3);
  check("[13b] resume counted the finished lot as reuse", second.lotsReused === 1 && second.lotsCreated === 2);
  const third = await applySalePlan(p, db);
  check("[12] rerun after full apply is entirely reuse", third.lotsCreated === 0 && third.resultsCreated === 0 && third.lotsReused === 3 && third.resultsReused === 3);
  check("[13c] never a second current result", [...db.results.values()].filter((r) => r.is_current).length === 3);
}

// contradiction detection on live-vs-plan drift
{
  const db = fakeDb();
  const p = applyPlanFixture();
  await applySalePlan(p, db);
  const lot2 = [...db.lots.values()].find((l) => l.lot_number === "2");
  lot2.reference_text = "DRIFTED";
  let threw = false;
  try { await applySalePlan(p, db); } catch (e) { threw = String(e).includes("CONTRADICTION"); }
  check("live drift aborts loudly as a contradiction", threw);
}

// [14] no session/credential/essay material anywhere in the plan
{
  const bytes = planToBytes(mkPlan());
  check("[14] plan contains no cookie/session/credential material", !/cookie|session|authorization|bearer|password/i.test(bytes));
}

// ── real pinned sources, when present ──
const realPdf = process.env.PHILLIPS_RESULTS_PDF;
const realHtml = process.env.PHILLIPS_SALE_HTML;
if (realPdf && fs.existsSync(realPdf) && realHtml && fs.existsSync(realHtml)) {
  const buf = fs.readFileSync(realPdf);
  check("[1] real results PDF matches pin", sha256(buf) === saleManifest.resultsPdf.sha256);
  const text = extractPdfText(buf);
  const prices = parseResultsTable(text);
  check("[3] exactly 156 sold results discovered", prices.size === 156);
  check("official total parsed = 75,807,200", parseResultsTotal(text) === 75807200);
  const html = fs.readFileSync(realHtml, "utf8");
  const realTiles = parseSaleTiles(html);
  check("[2] exactly 156 lots discovered from the sale page", realTiles.length === 156);
  const rj = joinSaleFacts(realTiles, prices, saleManifest.expected);
  check("[4] real join: 156 rows, zero problems", rj.rows.length === 156 && rj.problems.length === 0);
  check("[5] real: lots 103 and 123 absent", !rj.rows.some((r) => r.lot_number === "103" || r.lot_number === "123"));
  check("real reconciliation: sum equals official total", rj.total === 75807200);
  const spot = Object.fromEntries(rj.rows.filter((r) => ["1", "22", "124", "158"].includes(r.lot_number)).map((r) => [r.lot_number, r]));
  check("spot lot 1: F.P. Journe 508000", spot["1"].brand_text === "F.P. Journe" && spot["1"].price_realized === 508000);
  check("spot lot 22: Omega 2998-5 22860", spot["22"].reference_text === "2998-5" && spot["22"].price_realized === 22860);
  check("spot lot 124: Grand Seiko SBGZ007 78740", spot["124"].reference_text === "SBGZ007" && spot["124"].price_realized === 78740);
  check("spot lot 158: Vianney Halter Antiqua 584200", spot["158"].brand_text === "Vianney Halter" && spot["158"].price_realized === 584200);
} else {
  console.log("(real-source checks skipped — set PHILLIPS_RESULTS_PDF and PHILLIPS_SALE_HTML)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
