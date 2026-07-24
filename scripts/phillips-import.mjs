/* ════════════════════════════════════════════════════════════════════════
   PHILLIPS ADAPTER — FLIGHT 1  (scripts/phillips-import.mjs)

   The smallest repeatable Phillips → Auction Evidence ingestion path, bounded
   to one reviewed lot. Two phases, deliberately separated:

     --dry-run   verify the source packet (PDF hashes, results-PDF facts, live
                 lot-page facts), inspect the live database, and write a
                 DETERMINISTIC PLAN file. No database write of any kind.
     --apply     execute a previously written plan VERBATIM. No refetching, no
                 reinterpretation — if the manifest changed since the plan was
                 made, apply refuses.

   The Result row is written ONLY through the controlled RPC
   auction_evidence_create_or_correct_result. Nothing here touches protected
   rights-state or lot-fact columns — inserts only, on tables whose INSERT the
   v2.61 privilege model grants to service_role.

   Idempotency: the plan records, per entity, whether it will CREATE or REUSE
   an existing row. Existing-but-different is a CONTRADICTION: the script
   stops and reports; it never overwrites and never creates a parallel lot.

   Usage:
     node scripts/phillips-import.mjs --dry-run \
       --manifest scripts/phillips/ny080126-lot22.manifest.json \
       --results-pdf <path> --catalogue-pdf <path> --plan <out.json>
     node scripts/phillips-import.mjs --apply --plan <out.json> \
       --manifest scripts/phillips/ny080126-lot22.manifest.json

   PFC274 = 62 — the evaluate route is untouched by this script.
   ════════════════════════════════════════════════════════════════════════ */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";

/* Reviewer authority — the repo's proven founder convention (see
   app/api/admin/listings/[id]/status/route.ts): a hardcoded literal per
   surface, deliberately independent of any shared constant, verified against
   the live profiles table before any write. */
const FOUNDER_UID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

// ── small utilities ──────────────────────────────────────────────────────

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

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

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

// ── results-PDF text extraction (dependency-free; Flate text streams) ────

export function extractPdfText(buf) {
  let raw = "";
  let i = 0;
  while ((i = buf.indexOf("stream", i)) !== -1) {
    let s = i + 6;
    if (buf[s] === 13) s++;
    if (buf[s] === 10) s++;
    const e = buf.indexOf("endstream", s);
    if (e === -1) break;
    try {
      raw += zlib.inflateSync(buf.subarray(s, e)).toString("latin1");
    } catch {
      /* non-Flate stream (image/font) — irrelevant to the text layer */
    }
    i = e + 9;
  }
  const parts = [];
  const re = /\((?:\\.|[^\\)])*\)/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    parts.push(
      m[0]
        .slice(1, -1)
        .replace(/\\([()\\])/g, "$1")
        .replace(/\\(\d{3})/g, (_a, o) => String.fromCharCode(parseInt(o, 8)))
    );
  }
  return parts.join(" ").replace(/\s+/g, " ");
}

/* Parse the sold-lots table ("Lot Price N price N price ...") into a map. */
export function parseResultsTable(text) {
  const prices = new Map();
  const re = /(?:^|\s)(\d{1,3})\s+(\d{1,3}(?:,\d{3})+|\d{3,})(?=\s)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const lot = m[1];
    const price = Number(m[2].replace(/,/g, ""));
    if (!prices.has(lot)) prices.set(lot, price);
  }
  return prices;
}

export function verifyResultsPdf(text, manifest) {
  const problems = [];
  if (!text.includes(manifest.sale.sale_number)) problems.push(`sale number ${manifest.sale.sale_number} not found in results PDF`);
  if (!text.includes("June 13, 2026")) problems.push("results-file date June 13, 2026 not found");
  if (!/include the buyer'?s premium/i.test(text)) problems.push("buyer's-premium statement not found (price_basis authority)");
  const prices = parseResultsTable(text);
  const lotPrice = prices.get(manifest.lot.lot_number);
  if (lotPrice === undefined) problems.push(`lot ${manifest.lot.lot_number} not present in results table`);
  else if (lotPrice !== manifest.result.price_realized)
    problems.push(`lot ${manifest.lot.lot_number} price mismatch: results PDF says ${lotPrice}, manifest says ${manifest.result.price_realized}`);
  return { problems, lotPrice };
}

export function verifyLotPageHtml(html, manifest) {
  const problems = [];
  const want = [
    manifest.lot.model_text,
    manifest.lot.reference_text,
    manifest.sale.sale_number,
    manifest.lot.brand_text,
  ];
  for (const needle of want) {
    if (!html.includes(needle)) problems.push(`lot page missing expected text: ${JSON.stringify(needle)}`);
  }
  if (!new RegExp(`Lot\\s*(<[^>]*>\\s*)*${manifest.lot.lot_number}\\b`).test(html))
    problems.push(`lot page does not show Lot ${manifest.lot.lot_number}`);
  return problems;
}

// ── plan construction (deterministic) ────────────────────────────────────

function lotDescription(manifest) {
  return `${manifest.lot.as_stated_description}. ${manifest.lot.attributed_summary}`;
}

async function buildPlan({ manifest, manifestHash, resultsHash, catalogueHash, lotPageHash, db }) {
  const plan = {
    version: 1,
    flight: "phillips-adapter-1",
    manifestHash,
    verified: {
      resultsPdfSha256: resultsHash,
      auctionPagePdfSha256: catalogueHash,
      lotPageContentSha256: lotPageHash,
    },
    reviewerUid: FOUNDER_UID,
    steps: [],
    contradictions: [],
  };

  // House
  const { data: houses, error: hErr } = await db
    .from("auction_evidence_house")
    .select("id,name,slug,website_url")
    .eq("slug", manifest.house.slug);
  if (hErr) fail(`house query: ${hErr.message}`);
  let houseRef = null;
  if (houses.length === 1) {
    const h = houses[0];
    if (h.name !== manifest.house.name || h.website_url !== manifest.house.website_url) {
      plan.contradictions.push(`existing house ${h.id} differs: ${JSON.stringify(h)} vs manifest`);
    }
    houseRef = h.id;
    plan.steps.push({ entity: "house", action: "reuse", id: h.id });
  } else if (houses.length === 0) {
    plan.steps.push({ entity: "house", action: "create", values: manifest.house });
  } else {
    plan.contradictions.push(`multiple houses share slug ${manifest.house.slug}`);
  }

  // Sale (keyed by house + sale_name; sale_number lives in source_url + attribution)
  let saleRef = null;
  if (houseRef) {
    const { data: sales, error: sErr } = await db
      .from("auction_evidence_sale")
      .select("id,sale_name,sale_date,location,source_url")
      .eq("house_id", houseRef)
      .eq("sale_name", manifest.sale.sale_name);
    if (sErr) fail(`sale query: ${sErr.message}`);
    if (sales.length === 1) {
      const s = sales[0];
      if (s.sale_date !== manifest.sale.sale_date || s.location !== manifest.sale.location) {
        plan.contradictions.push(`existing sale ${s.id} differs: ${JSON.stringify(s)} vs manifest`);
      }
      saleRef = s.id;
      plan.steps.push({ entity: "sale", action: "reuse", id: s.id });
    } else if (sales.length > 1) {
      plan.contradictions.push(`multiple sales named ${manifest.sale.sale_name} under house`);
    }
  }
  if (!saleRef && !plan.contradictions.length) {
    plan.steps.push({
      entity: "sale",
      action: "create",
      values: {
        sale_name: manifest.sale.sale_name,
        sale_date: manifest.sale.sale_date,
        location: manifest.sale.location,
        source_url: manifest.packet.auctionPageUrl,
      },
    });
  }

  // Artifacts — keyed by (sale, content_hash) for the PDFs, (sale, source_url)
  // for the lot page.
  const artifactSpecs = [
    {
      key: "results_pdf",
      source_url: manifest.packet.auctionPageUrl,
      content_hash: resultsHash,
      meta: manifest.artifacts.results_pdf,
    },
    {
      key: "auction_page_pdf",
      source_url: manifest.packet.auctionPageUrl,
      content_hash: catalogueHash,
      meta: manifest.artifacts.auction_page_pdf,
    },
    {
      key: "lot_page",
      source_url: manifest.packet.lotPageUrl,
      content_hash: lotPageHash,
      meta: manifest.artifacts.lot_page,
    },
  ];
  for (const spec of artifactSpecs) {
    let existing = null;
    if (saleRef) {
      const q = db
        .from("auction_evidence_source_artifact")
        .select("id,source_url,content_hash,intake_method,permission_status,publication_status,artifact_retention_scope")
        .eq("sale_id", saleRef);
      const { data: rows, error } = spec.key === "lot_page"
        ? await q.eq("source_url", spec.source_url)
        : await q.eq("content_hash", spec.content_hash);
      if (error) fail(`artifact query (${spec.key}): ${error.message}`);
      if (rows.length === 1) existing = rows[0];
      else if (rows.length > 1) plan.contradictions.push(`multiple existing artifacts match ${spec.key}`);
    }
    if (existing) {
      if (existing.intake_method !== spec.meta.intake_method) {
        plan.contradictions.push(`artifact ${spec.key} exists with different intake_method (${existing.intake_method})`);
      }
      plan.steps.push({ entity: `artifact:${spec.key}`, action: "reuse", id: existing.id });
    } else {
      plan.steps.push({
        entity: `artifact:${spec.key}`,
        action: "create",
        values: {
          source_url: spec.source_url,
          retrieved_at: null, // stamped at apply time — the moment evidence is recorded
          content_hash: spec.content_hash,
          intake_method: spec.meta.intake_method,
          permission_status: "unresolved",
          automation_status: "not_applicable",
          publication_status: "internal_only",
          artifact_retention_scope: "metadata_only",
          full_artifact_storage_path: null,
          attribution_note: spec.meta.attribution_note,
          omission_statement: spec.meta.omission_statement,
        },
      });
    }
  }

  // Lot
  let lotRef = null;
  if (saleRef) {
    const { data: lots, error } = await db
      .from("auction_evidence_lot")
      .select("id,lot_number,brand_text,model_text,reference_text")
      .eq("sale_id", saleRef)
      .eq("lot_number", manifest.lot.lot_number);
    if (error) fail(`lot query: ${error.message}`);
    if (lots.length === 1) {
      const l = lots[0];
      if (
        l.brand_text !== manifest.lot.brand_text ||
        l.model_text !== manifest.lot.model_text ||
        l.reference_text !== manifest.lot.reference_text
      ) {
        plan.contradictions.push(`existing lot ${l.id} facts differ: ${JSON.stringify(l)} vs manifest`);
      }
      lotRef = l.id;
      plan.steps.push({ entity: "lot", action: "reuse", id: l.id });
    }
  }
  if (!lotRef && !plan.contradictions.length) {
    plan.steps.push({
      entity: "lot",
      action: "create",
      values: {
        lot_number: manifest.lot.lot_number,
        brand_text: manifest.lot.brand_text,
        model_text: manifest.lot.model_text,
        reference_text: manifest.lot.reference_text,
        description: lotDescription(manifest),
        source_artifact_ref: "artifact:lot_page",
      },
    });
  }

  // Result — one current result per lot; created only via the controlled RPC.
  if (lotRef) {
    const { data: results, error } = await db
      .from("auction_evidence_result")
      .select("id,is_current,sale_outcome,price_realized,currency,price_basis")
      .eq("lot_id", lotRef)
      .eq("is_current", true);
    if (error) fail(`result query: ${error.message}`);
    if (results.length === 1) {
      const rr = results[0];
      const same =
        rr.sale_outcome === manifest.result.sale_outcome &&
        Number(rr.price_realized) === manifest.result.price_realized &&
        rr.currency === manifest.result.currency &&
        rr.price_basis === manifest.result.price_basis;
      if (same) plan.steps.push({ entity: "result", action: "reuse", id: rr.id });
      else plan.contradictions.push(`existing current result ${rr.id} differs: ${JSON.stringify(rr)} vs manifest`);
    } else {
      plan.steps.push({ entity: "result", action: "create_via_rpc", values: manifest.result });
    }
  } else if (!plan.contradictions.length) {
    plan.steps.push({ entity: "result", action: "create_via_rpc", values: manifest.result });
  }

  return plan;
}

// ── apply (verbatim plan execution) ──────────────────────────────────────

async function applyPlan(plan, manifest, db) {
  const ids = {};
  const step = (entity) => plan.steps.find((s) => s.entity === entity);

  // reviewer must exist — resolve, never assume
  const { data: reviewer, error: rErr } = await db
    .from("profiles")
    .select("id")
    .eq("id", plan.reviewerUid)
    .single();
  if (rErr || !reviewer) fail(`reviewer UID ${plan.reviewerUid} not found in profiles — refusing to write`);

  // House
  const hs = step("house");
  if (hs.action === "reuse") ids.house = hs.id;
  else {
    const { data, error } = await db
      .from("auction_evidence_house")
      .insert(hs.values)
      .select("id")
      .single();
    if (error) fail(`house insert: ${error.message}`);
    ids.house = data.id;
  }

  // Sale
  const ss = step("sale");
  if (ss.action === "reuse") ids.sale = ss.id;
  else {
    const { data, error } = await db
      .from("auction_evidence_sale")
      .insert({ ...ss.values, house_id: ids.house })
      .select("id")
      .single();
    if (error) fail(`sale insert: ${error.message}`);
    ids.sale = data.id;
  }

  // Artifacts
  for (const key of ["results_pdf", "auction_page_pdf", "lot_page"]) {
    const as = step(`artifact:${key}`);
    if (as.action === "reuse") {
      ids[`artifact:${key}`] = as.id;
      continue;
    }
    const values = { ...as.values, sale_id: ids.sale, retrieved_at: new Date().toISOString() };
    const { data, error } = await db
      .from("auction_evidence_source_artifact")
      .insert(values)
      .select("id")
      .single();
    if (error) fail(`artifact ${key} insert: ${error.message}`);
    ids[`artifact:${key}`] = data.id;
  }

  // Lot
  const ls = step("lot");
  if (ls.action === "reuse") ids.lot = ls.id;
  else {
    const { source_artifact_ref, ...rest } = ls.values;
    const { data, error } = await db
      .from("auction_evidence_lot")
      .insert({ ...rest, sale_id: ids.sale, source_artifact_id: ids[source_artifact_ref] })
      .select("id")
      .single();
    if (error) fail(`lot insert: ${error.message}`);
    ids.lot = data.id;
  }

  // Result — ONLY through the controlled RPC.
  const rs = step("result");
  if (rs.action === "reuse") {
    ids.result = rs.id;
    ids.resultCreated = false;
  } else {
    const { data, error } = await db.rpc("auction_evidence_create_or_correct_result", {
      p_lot_id: ids.lot,
      p_price_realized: rs.values.price_realized,
      p_currency: rs.values.currency,
      p_price_basis: rs.values.price_basis,
      p_sale_outcome: rs.values.sale_outcome,
      p_result_date: rs.values.result_date,
      p_source_artifact_id: ids["artifact:results_pdf"],
      p_supersedes_result_id: null,
      p_reviewer_uid: plan.reviewerUid,
    });
    if (error) fail(`result RPC: ${error.message}`);
    ids.result = data.id;
    ids.resultChainRoot = data.chain_root_id;
    ids.resultCreated = true;
  }
  return ids;
}

// ── main ─────────────────────────────────────────────────────────────────

async function main() {
  const manifestPath = arg("manifest");
  if (!manifestPath) fail("--manifest is required");
  const manifestBuf = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBuf.toString("utf8"));
  const manifestHash = sha256(manifestBuf);

  const planPath = arg("plan");
  if (!planPath) fail("--plan is required");

  if (has("dry-run")) {
    const resultsPath = arg("results-pdf");
    const cataloguePath = arg("catalogue-pdf");
    if (!resultsPath || !cataloguePath) fail("--results-pdf and --catalogue-pdf are required for --dry-run");

    // 1. hash-verify both PDFs against the pinned packet
    const resultsBuf = fs.readFileSync(resultsPath);
    const catalogueBuf = fs.readFileSync(cataloguePath);
    const resultsHash = sha256(resultsBuf);
    const catalogueHash = sha256(catalogueBuf);
    if (resultsHash !== manifest.packet.resultsPdf.sha256)
      fail(`results PDF hash mismatch: ${resultsHash} != pinned ${manifest.packet.resultsPdf.sha256}`);
    if (catalogueHash !== manifest.packet.auctionPagePdf.sha256)
      fail(`auction-page PDF hash mismatch: ${catalogueHash} != pinned ${manifest.packet.auctionPagePdf.sha256}`);

    // 2. validate reviewed result facts against the official results PDF
    const text = extractPdfText(resultsBuf);
    const { problems: pdfProblems, lotPrice } = verifyResultsPdf(text, manifest);
    if (pdfProblems.length) fail(`results-PDF validation:\n  - ${pdfProblems.join("\n  - ")}`);

    // 3. fetch the exact lot page (anonymous — no founder session) + validate
    const resp = await fetch(manifest.packet.lotPageUrl, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    if (!resp.ok) fail(`lot page fetch failed: HTTP ${resp.status}`);
    const html = await resp.text();
    const htmlProblems = verifyLotPageHtml(html, manifest);
    if (htmlProblems.length) fail(`lot-page validation:\n  - ${htmlProblems.join("\n  - ")}`);
    const lotPageHash = sha256(Buffer.from(html));

    // 4. inspect live DB + build the deterministic plan
    const db = serviceClient();
    const plan = await buildPlan({ manifest, manifestHash, resultsHash, catalogueHash, lotPageHash, db });

    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
    const creates = plan.steps.filter((s) => s.action !== "reuse").map((s) => `${s.entity}:${s.action}`);
    const reuses = plan.steps.filter((s) => s.action === "reuse").map((s) => s.entity);
    console.log(JSON.stringify({
      mode: "dry-run",
      ok: plan.contradictions.length === 0,
      verified: {
        resultsPdfHash: "match",
        auctionPagePdfHash: "match",
        resultsPdfLot22Price: lotPrice,
        lotPageFacts: "present",
      },
      plan: planPath,
      creates,
      reuses,
      contradictions: plan.contradictions,
    }, null, 2));
    if (plan.contradictions.length) process.exit(1);
    return;
  }

  if (has("apply")) {
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    if (plan.manifestHash !== manifestHash)
      fail("manifest changed since the plan was written — re-run --dry-run and re-approve");
    if (plan.contradictions?.length) fail("plan carries contradictions — refusing to apply");
    const db = serviceClient();
    const ids = await applyPlan(plan, manifest, db);
    console.log(JSON.stringify({ mode: "apply", ok: true, ids }, null, 2));
    return;
  }

  fail("pass --dry-run or --apply");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (isMain) {
  main().catch((e) => fail(e.stack ?? String(e)));
}
