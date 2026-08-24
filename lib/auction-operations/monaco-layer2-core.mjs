/* ════════════════════════════════════════════════════════════════════════
   MONACO LAYER 2 CORE — lib/auction-operations/monaco-layer2-core.mjs

   The ET33 / ET35 / ET36 registered packet: 821 historically-acquired lots,
   independently verified 2026-08-21 (ET33 gate €22,566,860 exact; ET35 gate
   €16,267,580 exact; ET36 sell-through 95.87% vs Monaco's published 95.9%).

   THE INPUT IS THE VERIFIED LAYER 2 CORPUS, NOT THE LIVE WEBSITE. Layer 1
   (raw acquisition) retired to provenance; the corpus JSONL is the payload,
   pinned by SHA-256 in the repo-held registered manifest. This core verifies
   every corpus-level expectation the Final Validation Report proved before
   a single database row is touched, then builds a deterministic plan in the
   EXACT shape the shared Monaco apply engine executes — so the bounded,
   idempotent, contradiction-refusing writer in scripts/monaco-legend-import
   (applyMonacoPlanSlice) is reused verbatim. No second write path exists.

   ── THE ET36 QUARANTINE, HONORED STRUCTURALLY ──────────────────────────
   ET36 has no official result sheet. Its prices are current-website
   "Result (Premium)" values on a different premium basis (the documented
   1.04 relationship: 1.30 TTC vs 1.25 ex-VAT factors — a caveat, never a
   transform). The law from the acquisition: those values are never mapped
   to a realized-result field without a labelled column making the
   difference visible. auction_evidence_result has no such column, so ET36
   sold rows ingest with their OUTCOME and a NULL price — withheld, loudly
   counted in the plan summary, releasable later through the governed
   correction chain once the founder semantics ruling lands. wantedResult()
   below is where that law is enforced; do not "fix" it into writing the
   website numbers.

   ── SALE CHRONOLOGY ────────────────────────────────────────────────────
   sale_date comes from the corpus's own explicit dates and the manifest's
   chronological_position_among_known_six marker rides into each artifact's
   attribution note. Nothing here infers ordering from ingestion time or
   date comparison — the six known sales arrive in run order, not
   chronological order, by design.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import crypto from "node:crypto";

const FOUNDER_UID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function stop(message) { throw new Error(message); }

/** "" and "None" in the corpus are absences, preserved as null — never
    guessed, never backfilled. */
function textOrNull(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" || t === "None" ? null : t;
}
function intOrNull(v) {
  const t = textOrNull(v);
  if (t === null) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) stop(`non-integer money value: ${v}`);
  return n;
}
const flagTrue = (v) => String(v).toLowerCase() === "true";

// ── corpus parsing + verification ────────────────────────────────────────

export function parseLayer2Corpus(jsonlText) {
  const rows = [];
  for (const line of jsonlText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { stop(`corpus line ${rows.length + 1}: not valid JSON`); }
    rows.push(row);
  }
  return rows;
}

/* Every gate the Final Validation Report proved, re-proven here on the exact
   staged bytes. A corpus that drifts from its manifest in ANY of these is
   refused before the database is even read. */
export function validateLayer2Corpus(manifest, rows) {
  const problems = [];
  if (rows.length !== manifest.corpus.rows_total)
    problems.push(`rows ${rows.length} != ${manifest.corpus.rows_total}`);
  const wrongRights = rows.filter((r) => r.rights_status !== manifest.corpus.rights_status_all_rows);
  if (wrongRights.length) problems.push(`${wrongRights.length} rows with unexpected rights_status`);

  for (const sale of manifest.sales) {
    const rs = rows.filter((r) => r.sale_code === sale.code);
    const exp = sale.expected;
    if (rs.length !== exp.rows) problems.push(`${sale.code}: rows ${rs.length} != ${exp.rows}`);
    const numbers = rs.map((r) => Number(r.lot_number)).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) { problems.push(`${sale.code}: lot continuity breaks at ${i + 1}`); break; }
    }
    const outcomes = {};
    for (const r of rs) outcomes[r.sale_outcome] = (outcomes[r.sale_outcome] ?? 0) + 1;
    for (const [k, v] of Object.entries(exp.outcomes)) {
      if ((outcomes[k] ?? 0) !== v) problems.push(`${sale.code}: outcome ${k} ${outcomes[k] ?? 0} != ${v}`);
    }
    for (const k of Object.keys(outcomes)) {
      if (!(k in exp.outcomes)) problems.push(`${sale.code}: unexpected outcome vocabulary '${k}'`);
    }
    const official = rs.filter((r) => textOrNull(r.realized_result_official_premium_vat_eur) !== null);
    if (official.length !== exp.official_result_rows)
      problems.push(`${sale.code}: official result rows ${official.length} != ${exp.official_result_rows}`);
    if (exp.sold_sum_official_premium_vat_eur !== null) {
      const sum = official
        .filter((r) => r.sale_outcome === "sold")
        .reduce((acc, r) => acc + intOrNull(r.realized_result_official_premium_vat_eur), 0);
      if (sum !== exp.sold_sum_official_premium_vat_eur)
        problems.push(`${sale.code}: sold sum ${sum} != gate ${exp.sold_sum_official_premium_vat_eur}`);
    }
    const flagged = rs.filter((r) => flagTrue(r.price_semantics_review_required)).length;
    if (flagged !== exp.price_semantics_review_required_rows)
      problems.push(`${sale.code}: review-required rows ${flagged} != ${exp.price_semantics_review_required_rows}`);
    const urls = new Set(rs.map((r) => r.canonical_auction_url));
    if (urls.size !== 1 || !urls.has(sale.canonical_auction_url))
      problems.push(`${sale.code}: canonical auction URL drift`);
    const dates = new Set(rs.map((r) => r.sale_date_start));
    if (dates.size !== 1 || !dates.has(sale.date)) problems.push(`${sale.code}: sale date drift`);
    const positions = new Set(rs.map((r) => String(r.chronological_position_among_known_six)));
    if (positions.size !== 1 || !positions.has(String(sale.chronological_position_among_known_six)))
      problems.push(`${sale.code}: chronological position drift`);
  }
  if (problems.length) stop(`Layer 2 corpus fails its manifest gates:\n  - ${problems.join("\n  - ")}`);
}

// ── artifact specs (Monaco rights convention, corpus-provenance noted) ───

export function buildLayer2ArtifactSpecs(manifest, sale) {
  /* Quarantine is STRUCTURAL: a sale with no official result sheet is a
     sale whose sold prices are withheld, and its artifacts say so in the
     manifest's own words. Keyed by sale code so the statement can never
     silently attach to the wrong sale. */
  const quarantined = !sale.official_result_source;
  const quarantineStatement =
    manifest.quarantine?.[sale.code]?.statement ??
    "No official result sheet was available for this sale; sold outcomes ingest without realized prices pending a founder semantics ruling.";
  const common = {
    permission_status: "unresolved",
    publication_status: "internal_only",
    artifact_retention_scope: "metadata_only",
    full_artifact_storage_path: null,
    automation_status: "not_applicable",
  };
  const provenance =
    `Monaco Layer 2 corpus (JSONL sha256 ${manifest.corpus.sha256}); ` +
    `sale is chronological position ${sale.chronological_position_among_known_six} of the six known Monaco sales ` +
    `(explicit corpus marker — never inferred from dates); rights ${manifest.corpus.rights_status_all_rows}.`;
  const specs = [
    {
      key: "landing",
      source_url: sale.canonical_auction_url,
      content_hash: null,
      intake_method: "automated",
      attribution_note: `Monaco landing/lot pages, normalized during Layer 2 acquisition. ${provenance}`,
      price_basis_statement: quarantined
        ? "Monaco's website displays \"Result (Premium)\". This sale's page does not explicitly state the VAT basis, so composition is UNRESOLVED. Source-reported values are stored exactly as displayed under price_basis 'reported_result_basis_unverified' — no 1.04 conversion, no ex-VAT inference, no TTC inference, no inheritance of official-sheet semantics. Publishable as factual results; NOT eligible for normalized cross-house comparison."
        : "Landing Result (Premium) is the display value; realized results are recorded from the official result sheet only.",
      omission_statement: `${manifest.estimates_omission_sentence} Raw Monaco HTML, text, and images are not retained or published.${
        quarantined ? ` ${quarantineStatement}` : ""
      }`,
    },
  ];
  if (sale.official_result_source) {
    specs.push({
      key: "official_results_pdf",
      source_url: sale.official_result_source,
      content_hash: null,
      intake_method: "public_file",
      attribution_note: `Official Monaco result sheet for ${sale.name}. ${provenance}`,
      price_basis_statement:
        "Official auction results in EUR including buyer's premium and VAT, recorded under price_basis 'result_including_premium_and_vat' — the exact governed value for that semantics.",
      omission_statement: "Raw result-sheet PDF is not retained or published.",
    });
  }
  return specs.map((spec) => ({ ...common, ...spec }));
}

// ── row normalization + the quarantine law ───────────────────────────────

export function normalizeLayer2Rows(sale, corpusRows) {
  return corpusRows
    .filter((r) => r.sale_code === sale.code)
    .sort((a, b) => Number(a.lot_number) - Number(b.lot_number))
    .map((r) => ({
      lot_number: String(Number(r.lot_number)),
      brand_text: textOrNull(r.brand),
      model_text: textOrNull(r.model),
      reference_text: textOrNull(r.manufacturer_reference),
      description: textOrNull(r.source_title),
      outcome: r.sale_outcome,
      official_premium_vat_eur: intOrNull(r.realized_result_official_premium_vat_eur),
      /* The website-displayed figure, carried so a sale with no official
         result sheet can still record a trustworthy number under explicitly
         unresolved semantics instead of discarding the fact entirely. */
      website_result_premium_eur: intOrNull(r.website_result_premium_eur),
    }));
}

/* THE PRICE-SEMANTICS LAW LIVES HERE.

   Ingestion must terminate in exactly ONE of three honest states, and never
   in a generic bucket that collapses them:

     1. official result sheet present  → the exact governed basis. The sheet
        proves the figure includes buyer's premium and VAT.
     2. only the website-displayed figure → the number is trustworthy AS A
        SOURCE-REPORTED RESULT, and its composition is unresolved. That is a
        real epistemic state, not a placeholder: such a row is publishable
        as a fact and ineligible for normalized cross-house comparison, and
        both remain true indefinitely if the semantics are never settled.
     3. neither                        → NULL / NULL / NULL. No price fact.

   `other` is never emitted. It could not distinguish state 1 from state 2,
   which is precisely the erasure that had to be repaired in production.

   Nothing here transforms a number. No 1.04 ratio, no VAT arithmetic, no
   borrowing of the official sheet's semantics for a website figure — the
   raw displayed value survives exactly as displayed, or it is not stored. */
export function wantedLayer2Result(row, sale) {
  const sold = row.outcome === "sold";
  const official = sold && row.official_premium_vat_eur !== null;
  const reported = sold && !official && row.website_result_premium_eur !== null;
  const priced = official || reported;

  return {
    sale_outcome: row.outcome,
    price_realized: official
      ? row.official_premium_vat_eur
      : reported
        ? row.website_result_premium_eur
        : null,
    currency: priced ? sale.currency : null,
    price_basis: official
      ? "result_including_premium_and_vat"
      : reported
        ? "reported_result_basis_unverified"
        : null,
    result_date: sale.date,
    source_key: official ? "official_results_pdf" : "landing",
  };
}

// ── deterministic plan (same shape the shared Monaco engine applies) ─────

const sameLot = (a, b) =>
  a.brand_text === b.brand_text && a.model_text === b.model_text &&
  a.reference_text === b.reference_text && a.description === b.description;
const sameResult = (a, b) =>
  a.sale_outcome === b.sale_outcome &&
  (a.price_realized === null ? b.price_realized === null : Number(a.price_realized) === b.price_realized) &&
  a.currency === b.currency && a.price_basis === b.price_basis;

async function q(request, label) {
  const { data, error } = await request;
  if (error) stop(`${label}: ${error.message}`);
  return data;
}

export async function buildLayer2Plan({ manifest, corpusSha256, rows, db }) {
  if (corpusSha256 !== manifest.corpus.sha256)
    stop(`corpus hash ${corpusSha256} does not match the registered packet`);
  validateLayer2Corpus(manifest, rows);

  const house = { ...manifest.house };
  const existingHouse = await q(
    db.from("auction_evidence_house").select("id,name,slug,website_url").eq("slug", house.slug),
    "house query"
  );
  if (existingHouse.length > 1) stop("duplicate Monaco house rows");
  if (
    existingHouse.length &&
    (existingHouse[0].name !== house.name || existingHouse[0].website_url !== house.website_url)
  )
    stop("existing Monaco house differs");

  const sales = [];
  /* Two DIFFERENT facts, kept apart on purpose. A sold row with no
     trustworthy figure of any kind is withheld; a sold row carrying a
     source-reported figure whose composition is unknown is NOT withheld —
     it is recorded, honestly, under unresolved basis. Counting them as one
     number is the same conflation `other` made in the column. */
  let withheld = 0;
  let unresolvedBasis = 0;
  for (const sale of manifest.sales) {
    const saleRows = existingHouse.length
      ? await q(
          db.from("auction_evidence_sale")
            .select("id,sale_name,sale_date,location,source_url")
            .eq("house_id", existingHouse[0].id)
            .eq("source_url", sale.canonical_auction_url),
          `Sale ${sale.code} query`
        )
      : [];
    if (saleRows.length > 1) stop(`Sale ${sale.code}: duplicate rows`);
    if (
      saleRows.length &&
      (saleRows[0].sale_name !== sale.name || saleRows[0].sale_date !== sale.date || saleRows[0].location !== sale.location)
    )
      stop(`Sale ${sale.code}: existing facts differ`);
    const live = saleRows[0];

    const specs = buildLayer2ArtifactSpecs(manifest, sale);
    const oldArtifacts = live
      ? await q(
          db.from("auction_evidence_source_artifact").select("id,source_url,content_hash").eq("sale_id", live.id),
          `Sale ${sale.code} artifact query`
        )
      : [];
    for (const spec of specs) {
      if (oldArtifacts.some((row) => row.source_url === spec.source_url && row.content_hash !== spec.content_hash))
        stop(`Sale ${sale.code}: ${spec.key} conflicts with an existing artifact`);
    }

    const oldLots = live
      ? await q(
          db.from("auction_evidence_lot")
            .select("id,lot_number,brand_text,model_text,reference_text,description")
            .eq("sale_id", live.id),
          `Sale ${sale.code} lot query`
        )
      : [];
    const results = oldLots.length
      ? await q(
          db.from("auction_evidence_result")
            .select("id,lot_id,sale_outcome,price_realized,currency,price_basis")
            .in("lot_id", oldLots.map((row) => row.id))
            .eq("is_current", true),
          `Sale ${sale.code} result query`
        )
      : [];
    const lotMap = new Map(oldLots.map((row) => [row.lot_number, row]));
    const resultMap = new Map(results.map((row) => [row.lot_id, row]));

    const planRows = normalizeLayer2Rows(sale, rows).map((row) => {
      const oldLot = lotMap.get(row.lot_number);
      const result = oldLot && resultMap.get(oldLot.id);
      const wanted = wantedLayer2Result(row, sale);
      if (row.outcome === "sold" && wanted.price_realized === null) withheld += 1;
      if (wanted.price_basis === "reported_result_basis_unverified") unresolvedBasis += 1;
      if (oldLot && !sameLot(oldLot, row)) stop(`Sale ${sale.code} lot ${row.lot_number}: existing facts differ`);
      if (result && !sameResult(result, wanted)) stop(`Sale ${sale.code} lot ${row.lot_number}: existing result differs`);
      return {
        lot_number: row.lot_number,
        brand_text: row.brand_text,
        model_text: row.model_text,
        reference_text: row.reference_text,
        description: row.description,
        source_key: "landing",
        lot_action: oldLot ? "reuse" : "create",
        result_action: result ? "reuse" : "create_via_rpc",
        result: wanted,
      };
    });

    sales.push({
      id: sale.code,
      sale: {
        id: sale.code,
        name: sale.name,
        date: sale.date,
        location: sale.location,
        currency: sale.currency,
        landing_url: sale.canonical_auction_url,
      },
      artifact_specs: specs,
      rows: planRows,
    });
  }

  const flat = sales.flatMap((s) => s.rows);
  return {
    version: 1,
    flight: "monaco-layer2-et33-et35-et36",
    reviewer_uid: FOUNDER_UID,
    corpus: { sha256: corpusSha256, rows: rows.length },
    house,
    sales,
    summary: {
      house: existingHouse.length ? "reuse" : "create",
      lots_create: flat.filter((r) => r.lot_action === "create").length,
      lots_reuse: flat.filter((r) => r.lot_action === "reuse").length,
      results_create: flat.filter((r) => r.result_action === "create_via_rpc").length,
      results_reuse: flat.filter((r) => r.result_action === "reuse").length,
      // Sold rows with NO trustworthy figure of any kind.
      et36_sold_prices_withheld: withheld,
      // Sold rows whose figure IS trustworthy but whose composition is not.
      // Recorded, not withheld — and never comparison-eligible.
      sold_prices_unresolved_basis: unresolvedBasis,
      et36_review_required_rows: manifest.sales.reduce(
        (acc, s) => acc + s.expected.price_semantics_review_required_rows,
        0
      ),
    },
  };
}

export function layer2PlanToBytes(plan) {
  return JSON.stringify(plan, null, 2) + "\n";
}

export { sha256 as layer2Sha256 };
