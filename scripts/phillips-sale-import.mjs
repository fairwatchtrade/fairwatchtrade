/* ════════════════════════════════════════════════════════════════════════
   PHILLIPS SALE ADAPTER — BATCH INGESTION  (scripts/phillips-sale-import.mjs)

   Extends the proven v2.62 lot importer (phillips-import.mjs — untouched;
   its PDF-text extraction and results-table parser are imported from it) into
   a sale-level adapter: one Phillips sale in, one deterministic reviewed plan
   out, applied record-by-record through the existing controlled interfaces.

   Phillips-specific and reusable: point it at a different Phillips sale
   packet (sale JSON + PDFs) later. NOT a generalized auction-house framework.

     --plan-gen  verify both PDF hashes, parse the official results PDF into
                 lot→price, fetch the sale page ONCE (anonymous — no session,
                 no per-lot crawling) and parse every server-rendered lot
                 tile, join identity↔result by exact printed lot number,
                 reconcile the premium-inclusive total, classify every row
                 against live production (reuse / create / contradiction),
                 and write one deterministic plan. No database writes.
     --apply     execute a hash-bound plan record by record. Check-then-act
                 per record from the plan's own facts (never regenerated), so
                 an interrupted apply resumes idempotently: existing-identical
                 rows are skipped, existing-different rows abort loudly.
                 Results are written ONLY through
                 auction_evidence_create_or_correct_result.

   Missing model/reference text is preserved as missing — never guessed.
   Estimates are never captured (schema does not model them); their omission
   is stated on the auction-page artifact's omission metadata per the order.

   PFC274 = 62 — the evaluate route is untouched by this script.
   ════════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { extractPdfText, parseResultsTable } from "./phillips-import.mjs";

/* Reviewer authority — same proven per-surface founder-literal convention as
   the accepted canary (see phillips-import.mjs and the admin status route),
   verified against profiles before any write. */
const FOUNDER_UID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

// ── cli / env helpers ────────────────────────────────────────────────────

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
}
const has = (name) => process.argv.includes(`--${name}`);
function fail(msg) {
  console.error(`\nSTOP: ${msg}`);
  process.exit(1);
}
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
function serviceClient() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)");
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── sale-page tile parsing (server-rendered; one fetch, no crawling) ─────

const decodeHtml = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

export function parseSaleTiles(html) {
  const chunks = html.split('seldon-object-tile__lot-number seldon-text--headingSmall">');
  const lots = [];
  for (let i = 1; i < chunks.length; i++) {
    const c = chunks[i];
    const lotNumber = c.slice(0, c.indexOf("<")).trim();
    const makerM = c.match(/__maker[^>]*>(?:<div[^>]*>)?([\s\S]*?)<\/span>/);
    const refM = c.match(/__reference-number[^>]*>([\s\S]*?)<\/span>/);
    const modelM = c.match(/__model[^>]*>(?:<div[^>]*>)?([\s\S]*?)<\/span>(?:<\/div>)?<\/span>/);
    lots.push({
      lot_number: lotNumber,
      brand_text: makerM ? decodeHtml(makerM[1]) || null : null,
      reference_text: refM ? decodeHtml(refM[1]).replace(/^Ref\.\s*/, "") || null : null,
      model_text: modelM ? decodeHtml(modelM[1]) || null : null,
    });
  }
  return lots;
}

export function parseResultsTotal(text) {
  const m = text.match(/Total Sold \(including premium\):\s*\$\s*([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/* Join identity tiles ↔ results-PDF prices by exact printed lot number.
   Every mismatch is a hard problem — no partial joins, no guessing. */
export function joinSaleFacts(tiles, prices, expected) {
  const problems = [];
  const seen = new Set();
  for (const t of tiles) {
    if (!/^\d+$/.test(t.lot_number)) problems.push(`bad lot number: ${JSON.stringify(t.lot_number)}`);
    if (seen.has(t.lot_number)) problems.push(`duplicate lot tile: ${t.lot_number}`);
    seen.add(t.lot_number);
    if (!t.brand_text) problems.push(`lot ${t.lot_number}: missing brand/maker text`);
  }
  if (tiles.length !== expected.lotCount)
    problems.push(`tile count ${tiles.length} != expected ${expected.lotCount}`);
  if (prices.size !== expected.lotCount)
    problems.push(`results-PDF sold count ${prices.size} != expected ${expected.lotCount}`);

  for (const absent of expected.absentLotNumbers) {
    if (seen.has(absent)) problems.push(`lot ${absent} should be absent from the sale page but was found`);
    if (prices.has(absent)) problems.push(`lot ${absent} should be absent from results but has a price`);
  }

  const rows = [];
  for (const t of tiles) {
    if (!prices.has(t.lot_number)) {
      problems.push(`lot ${t.lot_number} has identity but no sold result`);
      continue;
    }
    rows.push({ ...t, price_realized: prices.get(t.lot_number) });
  }
  for (const lot of prices.keys()) {
    if (!seen.has(lot)) problems.push(`results-PDF lot ${lot} has no identity tile`);
  }

  const total = rows.reduce((a, r) => a + r.price_realized, 0);
  if (total !== expected.totalSoldIncludingPremium)
    problems.push(`reconciliation FAILED: joined total ${total} != official ${expected.totalSoldIncludingPremium}`);

  rows.sort((a, b) => Number(a.lot_number) - Number(b.lot_number));
  return { rows, problems, total };
}

// ── plan generation ──────────────────────────────────────────────────────

export function buildSalePlanObject({ saleManifest, saleManifestHash, joined, salePageSha256, live }) {
  const plan = {
    version: 1,
    flight: "phillips-sale-batch",
    saleCode: saleManifest.saleCode,
    saleManifestHash,
    sources: {
      auctionPageUrl: saleManifest.auctionPageUrl,
      resultsPdfSha256: saleManifest.resultsPdf.sha256,
      auctionPagePdfSha256: saleManifest.auctionPagePdf.sha256,
      salePageContentSha256: salePageSha256,
      priceBasisStatement:
        "The official results PDF states its US-dollar prices include the buyer's premium and are rounded to the nearest dollar.",
    },
    reconciliation: {
      lotCount: joined.rows.length,
      totalSoldIncludingPremium: joined.total,
      absentLotNumbers: saleManifest.expected.absentLotNumbers,
    },
    reviewerUid: FOUNDER_UID,
    ids: {
      house: live.houseId,
      sale: live.saleId,
      resultsPdfArtifact: live.resultsPdfArtifactId,
      auctionPagePdfArtifact: live.auctionPagePdfArtifactId,
    },
    artifactMetadataSteps: live.estimatesOmissionPresent
      ? []
      : [
          {
            action: "append_omission",
            artifactId: live.auctionPagePdfArtifactId,
            sentence: saleManifest.estimates_omission_sentence,
          },
        ],
    lots: joined.rows.map((r) => {
      const existing = live.lotsByNumber.get(r.lot_number);
      const existingResult = live.currentResultsByLot.get(r.lot_number);
      let lotAction = "create";
      let resultAction = "create_via_rpc";
      const contradictions = [];
      if (existing) {
        const identityMatch =
          existing.brand_text === r.brand_text &&
          existing.model_text === r.model_text &&
          existing.reference_text === r.reference_text;
        if (identityMatch) lotAction = "reuse";
        else contradictions.push(`existing lot ${existing.id} identity differs`);
      }
      if (existingResult) {
        const same =
          existingResult.sale_outcome === "sold" &&
          Number(existingResult.price_realized) === r.price_realized &&
          existingResult.currency === saleManifest.result_defaults.currency &&
          existingResult.price_basis === saleManifest.result_defaults.price_basis;
        if (same) resultAction = "reuse";
        else contradictions.push(`existing current result ${existingResult.id} differs`);
      }
      return {
        lot_number: r.lot_number,
        brand_text: r.brand_text,
        model_text: r.model_text,
        reference_text: r.reference_text,
        price_realized: r.price_realized,
        lotAction,
        resultAction,
        ...(existing ? { existingLotId: existing.id } : {}),
        ...(existingResult ? { existingResultId: existingResult.id } : {}),
        ...(contradictions.length ? { contradictions } : {}),
      };
    }),
  };
  plan.contradictions = plan.lots.flatMap((l) => l.contradictions ?? []);
  plan.summary = {
    lotCreates: plan.lots.filter((l) => l.lotAction === "create").length,
    lotReuses: plan.lots.filter((l) => l.lotAction === "reuse").length,
    resultCreates: plan.lots.filter((l) => l.resultAction === "create_via_rpc").length,
    resultReuses: plan.lots.filter((l) => l.resultAction === "reuse").length,
    contradictions: plan.contradictions.length,
  };
  return plan;
}

export function planToBytes(plan) {
  return JSON.stringify(plan, null, 2) + "\n";
}

async function inspectLive(db, saleManifest) {
  const { data: houses, error: hErr } = await db
    .from("auction_evidence_house")
    .select("id")
    .eq("slug", saleManifest.sale.house_slug);
  if (hErr) fail(`house query: ${hErr.message}`);
  if (houses.length !== 1) fail(`expected exactly 1 phillips house, found ${houses.length} — canary mismatch`);
  const houseId = houses[0].id;

  const { data: sales, error: sErr } = await db
    .from("auction_evidence_sale")
    .select("id,sale_date,location")
    .eq("house_id", houseId)
    .eq("sale_name", saleManifest.sale.sale_name);
  if (sErr) fail(`sale query: ${sErr.message}`);
  if (sales.length !== 1) fail(`expected exactly 1 NY080126 sale, found ${sales.length} — canary mismatch`);
  if (sales[0].sale_date !== saleManifest.sale.sale_date) fail(`sale_date mismatch — canary contradiction`);
  const saleId = sales[0].id;

  const { data: artifacts, error: aErr } = await db
    .from("auction_evidence_source_artifact")
    .select("id,content_hash,source_url,omission_statement")
    .eq("sale_id", saleId);
  if (aErr) fail(`artifact query: ${aErr.message}`);
  if (artifacts.length !== 3) fail(`expected exactly 3 artifacts, found ${artifacts.length}`);
  const byHash = new Map(artifacts.filter((a) => a.content_hash).map((a) => [a.content_hash, a]));
  const resultsArt = byHash.get(saleManifest.resultsPdf.sha256);
  const pageArt = byHash.get(saleManifest.auctionPagePdf.sha256);
  if (!resultsArt || !pageArt) fail("existing artifacts do not carry the pinned PDF hashes — stop");

  const { data: lots, error: lErr } = await db
    .from("auction_evidence_lot")
    .select("id,lot_number,brand_text,model_text,reference_text")
    .eq("sale_id", saleId);
  if (lErr) fail(`lot query: ${lErr.message}`);
  const lotsByNumber = new Map(lots.map((l) => [l.lot_number, l]));

  const currentResultsByLot = new Map();
  if (lots.length) {
    const { data: results, error: rErr } = await db
      .from("auction_evidence_result")
      .select("id,lot_id,sale_outcome,price_realized,currency,price_basis,is_current")
      .in("lot_id", lots.map((l) => l.id))
      .eq("is_current", true);
    if (rErr) fail(`result query: ${rErr.message}`);
    const lotNoById = new Map(lots.map((l) => [l.id, l.lot_number]));
    for (const r of results) currentResultsByLot.set(lotNoById.get(r.lot_id), r);
  }

  return {
    houseId,
    saleId,
    resultsPdfArtifactId: resultsArt.id,
    auctionPagePdfArtifactId: pageArt.id,
    estimatesOmissionPresent: (pageArt.omission_statement ?? "").includes("estimates are deliberately not captured"),
    lotsByNumber,
    currentResultsByLot,
  };
}

// ── apply (record by record, resumable) ──────────────────────────────────

export async function applySalePlan(plan, db, opts = {}) {
  const progress = { lotsCreated: 0, lotsReused: 0, resultsCreated: 0, resultsReused: 0, lastLot: null };
  const stopAfter = opts.stopAfter ?? Infinity;

  const { data: reviewer, error: rvErr } = await db
    .from("profiles")
    .select("id")
    .eq("id", plan.reviewerUid)
    .single();
  if (rvErr || !reviewer) throw new Error(`reviewer UID ${plan.reviewerUid} not found in profiles — refusing to write`);

  for (const step of plan.artifactMetadataSteps ?? []) {
    if (step.action === "append_omission") {
      const { data: art, error } = await db
        .from("auction_evidence_source_artifact")
        .select("omission_statement")
        .eq("id", step.artifactId)
        .single();
      if (error) throw new Error(`artifact read: ${error.message}`);
      if (!(art.omission_statement ?? "").includes("estimates are deliberately not captured")) {
        const next = `${art.omission_statement ?? ""} ${step.sentence}`.trim();
        const { error: uErr } = await db
          .from("auction_evidence_source_artifact")
          .update({ omission_statement: next })
          .eq("id", step.artifactId);
        if (uErr) throw new Error(`artifact omission update: ${uErr.message}`);
      }
    }
  }

  let processed = 0;
  for (const lot of plan.lots) {
    if (processed >= stopAfter) {
      return { ...progress, interrupted: true };
    }

    // ── lot record: check-then-act from the PLAN's facts ──
    let lotId = lot.existingLotId ?? null;
    const { data: liveLots, error: lErr } = await db
      .from("auction_evidence_lot")
      .select("id,brand_text,model_text,reference_text")
      .eq("sale_id", plan.ids.sale)
      .eq("lot_number", lot.lot_number);
    if (lErr) throw new Error(`lot ${lot.lot_number} query: ${lErr.message}`);
    if (liveLots.length === 1) {
      const l = liveLots[0];
      const same =
        l.brand_text === lot.brand_text &&
        l.model_text === lot.model_text &&
        l.reference_text === lot.reference_text;
      if (!same) throw new Error(`CONTRADICTION at lot ${lot.lot_number}: live identity differs from plan`);
      lotId = l.id;
      progress.lotsReused++;
    } else if (liveLots.length === 0) {
      const { data, error } = await db
        .from("auction_evidence_lot")
        .insert({
          sale_id: plan.ids.sale,
          lot_number: lot.lot_number,
          brand_text: lot.brand_text,
          model_text: lot.model_text,
          reference_text: lot.reference_text,
          description: null,
          source_artifact_id: plan.ids.auctionPagePdfArtifact,
        })
        .select("id")
        .single();
      if (error) throw new Error(`lot ${lot.lot_number} insert: ${error.message}`);
      lotId = data.id;
      progress.lotsCreated++;
    } else {
      throw new Error(`CONTRADICTION at lot ${lot.lot_number}: duplicate live rows`);
    }

    // ── result record: never a second current ──
    const { data: liveResults, error: rErr } = await db
      .from("auction_evidence_result")
      .select("id,sale_outcome,price_realized,currency,price_basis")
      .eq("lot_id", lotId)
      .eq("is_current", true);
    if (rErr) throw new Error(`result ${lot.lot_number} query: ${rErr.message}`);
    if (liveResults.length === 1) {
      const r = liveResults[0];
      const same =
        r.sale_outcome === "sold" &&
        Number(r.price_realized) === lot.price_realized &&
        r.currency === plan.resultDefaults.currency &&
        r.price_basis === plan.resultDefaults.price_basis;
      if (!same) throw new Error(`CONTRADICTION at lot ${lot.lot_number}: live current result differs from plan`);
      progress.resultsReused++;
    } else if (liveResults.length === 0) {
      const { error } = await db.rpc("auction_evidence_create_or_correct_result", {
        p_lot_id: lotId,
        p_price_realized: lot.price_realized,
        p_currency: plan.resultDefaults.currency,
        p_price_basis: plan.resultDefaults.price_basis,
        p_sale_outcome: plan.resultDefaults.sale_outcome,
        p_result_date: plan.resultDefaults.result_date,
        p_source_artifact_id: plan.ids.resultsPdfArtifact,
        p_supersedes_result_id: null,
        p_reviewer_uid: plan.reviewerUid,
      });
      if (error) throw new Error(`result ${lot.lot_number} RPC: ${error.message}`);
      progress.resultsCreated++;
    } else {
      throw new Error(`CONTRADICTION at lot ${lot.lot_number}: multiple current results`);
    }

    progress.lastLot = lot.lot_number;
    processed++;
  }
  return { ...progress, interrupted: false };
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const manifestPath = arg("sale-manifest");
  if (!manifestPath) fail("--sale-manifest is required");
  const manifestBuf = fs.readFileSync(manifestPath);
  const saleManifest = JSON.parse(manifestBuf.toString("utf8"));
  const saleManifestHash = sha256(manifestBuf);
  const planPath = arg("plan");
  if (!planPath) fail("--plan is required");

  if (has("plan-gen")) {
    const resultsPath = arg("results-pdf");
    const cataloguePath = arg("catalogue-pdf");
    if (!resultsPath || !cataloguePath) fail("--results-pdf and --catalogue-pdf are required");

    const resultsBuf = fs.readFileSync(resultsPath);
    const catalogueBuf = fs.readFileSync(cataloguePath);
    if (sha256(resultsBuf) !== saleManifest.resultsPdf.sha256) fail("results PDF hash mismatch");
    if (sha256(catalogueBuf) !== saleManifest.auctionPagePdf.sha256) fail("auction-page PDF hash mismatch");

    const text = extractPdfText(resultsBuf);
    const prices = parseResultsTable(text);
    const total = parseResultsTotal(text);
    if (total !== saleManifest.expected.totalSoldIncludingPremium)
      fail(`official total ${total} != expected ${saleManifest.expected.totalSoldIncludingPremium}`);
    if (!/include the buyer'?s premium/i.test(text)) fail("premium statement missing from results PDF");

    const salePagePath = arg("sale-page-html");
    let html;
    if (salePagePath) {
      html = fs.readFileSync(salePagePath, "utf8");
    } else {
      const resp = await fetch(saleManifest.auctionPageUrl, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      });
      if (!resp.ok) fail(`sale page fetch failed: HTTP ${resp.status}`);
      html = await resp.text();
    }
    const tiles = parseSaleTiles(html);
    const joined = joinSaleFacts(tiles, prices, saleManifest.expected);
    if (joined.problems.length) fail(`sale join:\n  - ${joined.problems.join("\n  - ")}`);

    const db = serviceClient();
    const live = await inspectLive(db, saleManifest);
    const plan = buildSalePlanObject({
      saleManifest,
      saleManifestHash,
      joined,
      salePageSha256: sha256(Buffer.from(html)),
      live,
    });
    plan.resultDefaults = saleManifest.result_defaults;
    const bytes = planToBytes(plan);
    fs.writeFileSync(planPath, bytes);
    console.log(JSON.stringify({
      mode: "plan-gen",
      ok: plan.contradictions.length === 0,
      planSha256: sha256(Buffer.from(bytes)),
      lots: joined.rows.length,
      totalReconciled: joined.total,
      summary: plan.summary,
      contradictions: plan.contradictions,
    }, null, 2));
    if (plan.contradictions.length) process.exit(1);
    return;
  }

  if (has("apply")) {
    const planBuf = fs.readFileSync(planPath);
    const expectedPlanHash = arg("plan-sha256");
    if (!expectedPlanHash) fail("--plan-sha256 is required — the plan must be hash-bound before apply");
    if (sha256(planBuf) !== expectedPlanHash.toLowerCase()) fail("plan hash mismatch — re-approve the plan");
    const plan = JSON.parse(planBuf.toString("utf8"));
    if (plan.saleManifestHash !== saleManifestHash) fail("sale manifest changed since the plan was written");
    if (plan.contradictions?.length) fail("plan carries contradictions — refusing to apply");

    const db = serviceClient();
    try {
      const progress = await applySalePlan(plan, db);
      console.log(JSON.stringify({ mode: "apply", ok: true, ...progress }, null, 2));
    } catch (e) {
      console.error(JSON.stringify({ mode: "apply", ok: false, error: String(e.message ?? e) }, null, 2));
      process.exit(1);
    }
    return;
  }

  fail("pass --plan-gen or --apply");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (isMain) {
  main().catch((e) => fail(e.stack ?? String(e)));
}
