/* Monaco Legend Sales 38/40/41 → Auction Evidence. Raw source material is
   never retained: landing pages use a versioned semantic digest; PDFs use
   their approved raw hashes. --apply executes a completed --dry-run plan. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const FOUNDER_UID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";
const MANIFESTS = ["38", "40", "41"].map((id) => path.join("scripts", "monaco-legend", `sale-${id}.sale.json`));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);
const same = (a, b) => json(a) === json(b);
function arg(name) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : null; }
function stop(message) { throw new Error(message); }
function loadEnv() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
function db() {
  loadEnv();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) stop("Supabase service credentials are missing");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
function text(value = "") {
  return value.replace(/<[^>]*>/g, " ").replace(/&#x([0-9a-f]+);?/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);?/g, (_, x) => String.fromCodePoint(Number(x))).replace(/&(nbsp|amp|quot|apos|lt|gt);/gi, (_, x) => ({ nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" })[x.toLowerCase()])
    .replace(/\u2060/g, "").replace(/\s+/g, " ").trim();
}
function classText(html, className) {
  const match = html.match(new RegExp(`<[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? text(match[1]) : null;
}
function amount(value) { const match = text(value).match(/(?:€|Fr\.?)[\s]*([\d.,'\s]+)/i); return match ? Number(match[1].replace(/[^\d]/g, "")) : null; }
function reference(title) { const match = title?.match(/\b(?:reference\b|ref\.?\b)\s*([A-Za-z0-9][A-Za-z0-9./-]*)/i); return match ? match[1].replace(/[.,;:]$/, "") : null; }

export function parseMonacoLanding(html, manifest) {
  const sections = html.match(/<section\b[^>]*class=["'][^"']*\blot\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi) ?? [];
  return sections.map((section) => {
    const lot_number = classText(section, "lot-number");
    if (!/^\d+$/.test(lot_number ?? "")) return null;
    const visible = text(section), description = classText(section, "lot-title"), outcome = /\bWITHDRAWN\b/i.test(visible) ? "withdrawn" : /\bPassed\b/i.test(visible) ? "passed" : "sold";
    return { lot_number, brand_text: classText(section, "lot-brand"), model_text: manifest.model_overrides?.[lot_number] ?? null,
      reference_text: reference(description), description: description ?? null, no_reserve: /\bNO\s+RESERVE\b/i.test(visible), outcome,
      price_realized: outcome === "sold" ? amount(classText(section, "lot-status-value")) : null };
  }).filter(Boolean).sort((a, b) => Number(a.lot_number) - Number(b.lot_number));
}
export function landingSemanticDigest(manifest, lots) {
  // Semantic input excludes only transport/session material by construction;
  // every parsed source-visible lot field and state remains in the digest.
  return hash(json({ version: manifest.semantic_digest_version, sale: manifest.sale.id, currency: manifest.sale.currency, sessions: manifest.sale.sessions, lots }));
}
function numbers(rows, outcome) { return rows.filter((row) => row.outcome === outcome).map((row) => Number(row.lot_number)); }
function sameNumbers(a, b) { return same([...a].sort((x, y) => x - y), [...b].sort((x, y) => x - y)); }
export function validateLanding(manifest, html, lots) {
  const e = manifest.expected, problems = [], listed = lots.map((lot) => Number(lot.lot_number));
  const wanted = Array.from({ length: e.range[1] - e.range[0] + 1 }, (_, i) => e.range[0] + i).filter((n) => !e.landing_absent.includes(n));
  if (lots.length !== e.landing_lot_count || !sameNumbers(listed, wanted)) problems.push("lot corpus/range differs from manifest");
  if (!sameNumbers(numbers(lots, "passed"), e.passed)) problems.push("Passed set differs from manifest");
  if (!sameNumbers(numbers(lots, "withdrawn"), e.withdrawn)) problems.push("Withdrawn set differs from manifest");
  if (lots.filter((lot) => lot.no_reserve).length !== e.no_reserve_count) problems.push("NO RESERVE count differs from manifest");
  for (const [start, end] of manifest.sale.sessions) if (!new RegExp(`Lots?\\s+${start}\\s+(?:to|-)\\s+(?:${end}|last)`, "i").test(text(html))) problems.push(`session ${start}-${end} is absent`);
  if (e.canary) {
    const lot = lots.find((row) => Number(row.lot_number) === e.canary.lot);
    if (!lot || lot.brand_text !== e.canary.brand || lot.model_text !== e.canary.model || lot.reference_text !== e.canary.reference || lot.price_realized !== e.canary.landing_price) problems.push("Sale 40 Lot 193 canary differs");
  }
  return problems;
}
export function normalizeRows(manifest, lots) {
  const rows = lots.map((lot) => ({ ...lot, source_key: "landing_html", contradictions: manifest.expected.pdf_contradictions?.[lot.lot_number] ? [{ source_key: "results_pdf", outcome: manifest.expected.pdf_contradictions[lot.lot_number] }] : [] }));
  for (const [lot_number, outcome] of Object.entries(manifest.expected.pdf_only_outcomes ?? {})) rows.push({ lot_number, brand_text: null, model_text: null, reference_text: null, description: null, no_reserve: false, outcome, price_realized: null, source_key: "results_pdf", contradictions: [] });
  return rows.sort((a, b) => Number(a.lot_number) - Number(b.lot_number));
}
function loadManifests() { return MANIFESTS.map((file) => { const value = JSON.parse(fs.readFileSync(file, "utf8")); if (value.manifest_version !== 1 || value.semantic_digest_version !== "monaco-landing-semantic-v1") stop(`unsupported manifest ${file}`); return { ...value, __file: file }; }); }
async function fetchBytes(url) { const response = await fetch(url, { headers: { "user-agent": "FairWatchTrade Monaco evidence verifier/1.0" } }); if (!response.ok) stop(`${url}: HTTP ${response.status}`); return Buffer.from(await response.arrayBuffer()); }
/* verifyMonacoSource - the acquisition-independent half of harvest. Bytes in,
   verified normalized packet out; throws on any drift. The CLI's harvest and
   the founder-only server seam both call THIS - one engine, two entrances.
   Network fetching and manifest-file reading stay with the caller. */
export function verifyMonacoSource({ manifest, manifestHash, landingHtml, catalogPdfBytes, resultsPdfBytes }) {
  for (const [key, bytes] of [["catalog_pdf", catalogPdfBytes], ["results_pdf", resultsPdfBytes]]) if (hash(bytes) !== manifest.artifacts[key].sha256) stop(`Sale ${manifest.sale.id} ${key} durable hash drift`);
  const lots = parseMonacoLanding(landingHtml, manifest), problems = validateLanding(manifest, landingHtml, lots);
  if (problems.length) stop(`Sale ${manifest.sale.id} source drift: ${problems.join("; ")}`);
  return { manifest, manifest_hash: manifestHash, landing_digest: landingSemanticDigest(manifest, lots), rows: normalizeRows(manifest, lots) };
}
async function harvest(manifest) {
  const [landing, catalog, results] = await Promise.all([fetchBytes(manifest.sale.landing_url), fetchBytes(manifest.artifacts.catalog_pdf.url), fetchBytes(manifest.artifacts.results_pdf.url)]);
  return verifyMonacoSource({ manifest, manifestHash: hash(fs.readFileSync(manifest.__file)), landingHtml: landing.toString("utf8"), catalogPdfBytes: catalog, resultsPdfBytes: results });
}
function house() { return { name: "Monaco Legend Auctions", slug: "monaco-legend-auctions", website_url: "https://www.monacolegendauctions.com" }; }
function artifacts(harvested) {
  const { manifest, landing_digest } = harvested, common = { permission_status: "unresolved", publication_status: "internal_only", artifact_retention_scope: "metadata_only", full_artifact_storage_path: null };
  const items = [
    ["landing_html", manifest.sale.landing_url, landing_digest, "automated", "allowed", "Monaco landing/lot-page semantic digest only.", "Landing Result (Premium) is the normalized result as displayed.", "Raw Monaco HTML, text, and images are not retained or published."],
    ["catalog_pdf", manifest.artifacts.catalog_pdf.url, manifest.artifacts.catalog_pdf.sha256, "public_file", "not_applicable", "Official Monaco catalog PDF metadata only.", null, "Raw catalog PDF is not retained or published; contradictory source facts remain non-public evidence."],
    ["results_pdf", manifest.artifacts.results_pdf.url, manifest.artifacts.results_pdf.sha256, "public_file", "not_applicable", "Official Monaco results PDF metadata only.", "Conflicting PDF figures are source evidence, never substituted normalized results.", `Raw results PDF is not retained or published. Contradictions: ${json({ only: manifest.expected.pdf_only_outcomes ?? {}, differs: manifest.expected.pdf_contradictions ?? {}, canary_pdf_price: manifest.expected.canary?.pdf_price ?? null })}`],
  ];
  if (manifest.artifacts.founder_capture) items.push(["founder_capture", manifest.artifacts.founder_capture.url, manifest.artifacts.founder_capture.sha256, "founder_supplied_file", "not_applicable", "Founder capture reconciled to official Sale 40 landing representation.", null, "Founder-capture bytes are not retained or published."]);
  return items.map(([key, source_url, content_hash, intake_method, automation_status, attribution_note, price_basis_statement, omission_statement]) => ({ ...common, key, source_url, content_hash, intake_method, automation_status, attribution_note, price_basis_statement, omission_statement }));
}
function wantedResult(row, sale) { return { sale_outcome: row.outcome, price_realized: row.outcome === "sold" ? row.price_realized : null, currency: row.outcome === "sold" ? sale.currency : null, price_basis: row.outcome === "sold" ? "other" : null, result_date: sale.date, source_key: row.source_key }; }
function sameLot(a, b) { return a.brand_text === b.brand_text && a.model_text === b.model_text && a.reference_text === b.reference_text && a.description === b.description; }
/* Null-safe price comparison: passed/withdrawn/unsold rows legitimately hold
   NULL price facts, and Number(null) is 0 — the old comparison read every
   existing non-sold row as a contradiction on replay/re-plan, which broke
   idempotent convergence for exactly the rows that never change. */
function sameResult(a, b) { const samePrice = a.price_realized === null || a.price_realized === undefined ? b.price_realized === null : Number(a.price_realized) === b.price_realized; return a.sale_outcome === b.sale_outcome && samePrice && a.currency === b.currency && a.price_basis === b.price_basis; }
async function query(request, label) { const { data, error } = await request; if (error) stop(`${label}: ${error.message}`); return data; }
async function makePlan(harvested, client) {
  const existingHouse = await query(client.from("auction_evidence_house").select("id,name,slug,website_url").eq("slug", house().slug), "house query");
  if (existingHouse.length > 1) stop("duplicate Monaco house rows");
  if (existingHouse.length && !same({ ...existingHouse[0], id: undefined }, { ...house(), id: undefined })) stop("existing Monaco house differs");
  const sales = [];
  for (const h of harvested) {
    const saleRows = existingHouse.length ? await query(client.from("auction_evidence_sale").select("id,sale_name,sale_date,location,source_url").eq("house_id", existingHouse[0].id).eq("source_url", h.manifest.sale.landing_url), `Sale ${h.manifest.sale.id} query`) : [];
    if (saleRows.length > 1) stop(`Sale ${h.manifest.sale.id}: duplicate rows`);
    if (saleRows.length && (saleRows[0].sale_name !== h.manifest.sale.name || saleRows[0].sale_date !== h.manifest.sale.date || saleRows[0].location !== h.manifest.sale.location)) stop(`Sale ${h.manifest.sale.id}: existing facts differ`);
    const sale = saleRows[0], oldArtifacts = sale ? await query(client.from("auction_evidence_source_artifact").select("id,source_url,content_hash").eq("sale_id", sale.id), `Sale ${h.manifest.sale.id} artifact query`) : [];
    const specs = artifacts(h); for (const spec of specs) if (oldArtifacts.some((row) => row.source_url === spec.source_url && row.content_hash !== spec.content_hash)) stop(`Sale ${h.manifest.sale.id}: ${spec.key} source drift conflicts with existing artifact`);
    const oldLots = sale ? await query(client.from("auction_evidence_lot").select("id,lot_number,brand_text,model_text,reference_text,description").eq("sale_id", sale.id), `Sale ${h.manifest.sale.id} lot query`) : [];
    const results = oldLots.length ? await query(client.from("auction_evidence_result").select("id,lot_id,sale_outcome,price_realized,currency,price_basis").in("lot_id", oldLots.map((row) => row.id)).eq("is_current", true), `Sale ${h.manifest.sale.id} result query`) : [];
    const lotMap = new Map(oldLots.map((row) => [row.lot_number, row])), resultMap = new Map(results.map((row) => [row.lot_id, row]));
    const rows = h.rows.map((row) => { const oldLot = lotMap.get(row.lot_number), result = oldLot && resultMap.get(oldLot.id), wanted = wantedResult(row, h.manifest.sale); if (oldLot && !sameLot(oldLot, row)) stop(`Sale ${h.manifest.sale.id} lot ${row.lot_number}: existing facts differ`); if (result && !sameResult(result, wanted)) stop(`Sale ${h.manifest.sale.id} lot ${row.lot_number}: existing result differs`); return { ...row, lot_action: oldLot ? "reuse" : "create", result_action: result ? "reuse" : "create_via_rpc", result: wanted }; });
    sales.push({ id: h.manifest.sale.id, manifest_hash: h.manifest_hash, landing_digest: h.landing_digest, sale: h.manifest.sale, artifact_specs: specs, rows });
  }
  return { version: 1, flight: "monaco-legend-38-40-41", reviewer_uid: FOUNDER_UID, manifests: harvested.map((h) => ({ id: h.manifest.sale.id, hash: h.manifest_hash })), house: house(), sales,
    summary: { house: existingHouse.length ? "reuse" : "create", sales_create: sales.filter((s) => !s.rows.every((r) => r.lot_action === "reuse")).length, lots_create: sales.flatMap((s) => s.rows).filter((r) => r.lot_action === "create").length, results_create: sales.flatMap((s) => s.rows).filter((r) => r.result_action === "create_via_rpc").length } };
}
async function one(client, table, where, label) { let request = client.from(table).select("id"); for (const [key, value] of Object.entries(where)) request = request.eq(key, value); const rows = await query(request, label); return rows; }
async function apply(plan, client) {
  const reviewer = await one(client, "profiles", { id: plan.reviewer_uid }, "reviewer query"); if (reviewer.length !== 1) stop("founder profile missing; refusing to write");
  let houses = await one(client, "auction_evidence_house", { slug: plan.house.slug }, "apply house query"), houseId;
  if (houses.length === 1) houseId = houses[0].id; else if (!houses.length) { const inserted = await query(client.from("auction_evidence_house").insert(plan.house).select("id"), "house insert"); houseId = inserted[0].id; } else stop("apply duplicate house");
  const progress = { house_id: houseId, sales: [] };
  for (const salePlan of plan.sales) {
    let sales = await query(client.from("auction_evidence_sale").select("id").eq("house_id", houseId).eq("source_url", salePlan.sale.landing_url), `apply sale ${salePlan.id}`), saleId;
    if (sales.length === 1) saleId = sales[0].id; else if (!sales.length) { const inserted = await query(client.from("auction_evidence_sale").insert({ house_id: houseId, sale_name: salePlan.sale.name, sale_date: salePlan.sale.date, location: salePlan.sale.location, source_url: salePlan.sale.landing_url }).select("id"), `sale ${salePlan.id} insert`); saleId = inserted[0].id; } else stop(`apply Sale ${salePlan.id}: duplicate`);
    const artifactIds = {}; for (const spec of salePlan.artifact_specs) { const found = await query(client.from("auction_evidence_source_artifact").select("id,content_hash").eq("sale_id", saleId).eq("source_url", spec.source_url), `artifact ${salePlan.id}/${spec.key}`); if (found.length === 1 && found[0].content_hash === spec.content_hash) artifactIds[spec.key] = found[0].id; else if (!found.length) { const { key, ...values } = spec, inserted = await query(client.from("auction_evidence_source_artifact").insert({ ...values, sale_id: saleId, retrieved_at: new Date().toISOString() }).select("id"), `artifact insert ${salePlan.id}/${spec.key}`); artifactIds[key] = inserted[0].id; } else stop(`apply Sale ${salePlan.id}: artifact contradiction ${spec.key}`); }
    let lots_created = 0, lots_reused = 0, results_created = 0, results_reused = 0;
    for (const row of salePlan.rows) {
      const lots = await query(client.from("auction_evidence_lot").select("id,brand_text,model_text,reference_text,description").eq("sale_id", saleId).eq("lot_number", row.lot_number), `lot ${salePlan.id}/${row.lot_number}`); let lotId;
      if (lots.length === 1) { if (!sameLot(lots[0], row)) stop(`apply lot contradiction ${salePlan.id}/${row.lot_number}`); lotId = lots[0].id; lots_reused++; } else if (!lots.length) { const inserted = await query(client.from("auction_evidence_lot").insert({ sale_id: saleId, lot_number: row.lot_number, brand_text: row.brand_text, model_text: row.model_text, reference_text: row.reference_text, description: row.description, source_artifact_id: artifactIds[row.source_key] }).select("id"), `lot insert ${salePlan.id}/${row.lot_number}`); lotId = inserted[0].id; lots_created++; } else stop(`apply duplicate lot ${salePlan.id}/${row.lot_number}`);
      const results = await query(client.from("auction_evidence_result").select("id,sale_outcome,price_realized,currency,price_basis").eq("lot_id", lotId).eq("is_current", true), `result ${salePlan.id}/${row.lot_number}`);
      if (results.length === 1) { if (!sameResult(results[0], row.result)) stop(`apply result contradiction ${salePlan.id}/${row.lot_number}`); results_reused++; } else if (!results.length) { const { error } = await client.rpc("auction_evidence_create_or_correct_result", { p_lot_id: lotId, p_price_realized: row.result.price_realized, p_currency: row.result.currency, p_price_basis: row.result.price_basis, p_sale_outcome: row.result.sale_outcome, p_result_date: row.result.result_date, p_source_artifact_id: artifactIds[row.result.source_key], p_supersedes_result_id: null, p_reviewer_uid: plan.reviewer_uid }); if (error) stop(`result RPC ${salePlan.id}/${row.lot_number}: ${error.message}`); results_created++; } else stop(`apply duplicate result ${salePlan.id}/${row.lot_number}`);
    }
    progress.sales.push({ id: salePlan.id, sale_id: saleId, artifacts: artifactIds, lots_created, lots_reused, results_created, results_reused });
  }
  return progress;
}

/* applyMonacoPlanSlice - the bounded server twin of apply(). Walks the same
   plan with the same check-then-act predicates and the same controlled result
   RPC, but stops at maxRows/deadlineMs and returns a durable cursor so an
   interrupted apply resumes exactly where it stopped. House/sale/artifact
   ensures are idempotent and re-run cheaply at each slice start. */
export async function applyMonacoPlanSlice(plan, client, opts = {}) {
  const maxRows = opts.maxRows ?? Infinity, deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const cursor = { sale_index: opts.cursor?.sale_index ?? 0, row_index: opts.cursor?.row_index ?? 0 };
  const counts = { lots_created: 0, lots_reused: 0, results_created: 0, results_reused: 0 };
  const reviewer = await one(client, "profiles", { id: plan.reviewer_uid }, "reviewer query");
  if (reviewer.length !== 1) stop("founder profile missing; refusing to write");
  let houses = await one(client, "auction_evidence_house", { slug: plan.house.slug }, "apply house query"), houseId;
  if (houses.length === 1) houseId = houses[0].id; else if (!houses.length) { const inserted = await query(client.from("auction_evidence_house").insert(plan.house).select("id"), "house insert"); houseId = inserted[0].id; } else stop("apply duplicate house");
  let processed = 0;
  for (; cursor.sale_index < plan.sales.length; cursor.sale_index++, cursor.row_index = 0) {
    const salePlan = plan.sales[cursor.sale_index];
    let sales = await query(client.from("auction_evidence_sale").select("id").eq("house_id", houseId).eq("source_url", salePlan.sale.landing_url), `apply sale ${salePlan.id}`), saleId;
    if (sales.length === 1) saleId = sales[0].id; else if (!sales.length) { const inserted = await query(client.from("auction_evidence_sale").insert({ house_id: houseId, sale_name: salePlan.sale.name, sale_date: salePlan.sale.date, location: salePlan.sale.location, source_url: salePlan.sale.landing_url }).select("id"), `sale ${salePlan.id} insert`); saleId = inserted[0].id; } else stop(`apply Sale ${salePlan.id}: duplicate`);
    const artifactIds = {};
    for (const spec of salePlan.artifact_specs) { const found = await query(client.from("auction_evidence_source_artifact").select("id,content_hash").eq("sale_id", saleId).eq("source_url", spec.source_url), `artifact ${salePlan.id}/${spec.key}`); if (found.length === 1 && found[0].content_hash === spec.content_hash) artifactIds[spec.key] = found[0].id; else if (!found.length) { const { key, ...values } = spec, inserted = await query(client.from("auction_evidence_source_artifact").insert({ ...values, sale_id: saleId, retrieved_at: new Date().toISOString() }).select("id"), `artifact insert ${salePlan.id}/${spec.key}`); artifactIds[key] = inserted[0].id; } else stop(`apply Sale ${salePlan.id}: artifact contradiction ${spec.key}`); }
    for (; cursor.row_index < salePlan.rows.length; cursor.row_index++) {
      if (processed >= maxRows || Date.now() > deadline) return { done: false, cursor, counts };
      const row = salePlan.rows[cursor.row_index];
      const lots = await query(client.from("auction_evidence_lot").select("id,brand_text,model_text,reference_text,description").eq("sale_id", saleId).eq("lot_number", row.lot_number), `lot ${salePlan.id}/${row.lot_number}`); let lotId;
      if (lots.length === 1) { if (!sameLot(lots[0], row)) stop(`apply lot contradiction ${salePlan.id}/${row.lot_number}`); lotId = lots[0].id; counts.lots_reused++; } else if (!lots.length) { const inserted = await query(client.from("auction_evidence_lot").insert({ sale_id: saleId, lot_number: row.lot_number, brand_text: row.brand_text, model_text: row.model_text, reference_text: row.reference_text, description: row.description, source_artifact_id: artifactIds[row.source_key] }).select("id"), `lot insert ${salePlan.id}/${row.lot_number}`); lotId = inserted[0].id; counts.lots_created++; } else stop(`apply duplicate lot ${salePlan.id}/${row.lot_number}`);
      const results = await query(client.from("auction_evidence_result").select("id,sale_outcome,price_realized,currency,price_basis").eq("lot_id", lotId).eq("is_current", true), `result ${salePlan.id}/${row.lot_number}`);
      if (results.length === 1) { if (!sameResult(results[0], row.result)) stop(`apply result contradiction ${salePlan.id}/${row.lot_number}`); counts.results_reused++; } else if (!results.length) { const { error } = await client.rpc("auction_evidence_create_or_correct_result", { p_lot_id: lotId, p_price_realized: row.result.price_realized, p_currency: row.result.currency, p_price_basis: row.result.price_basis, p_sale_outcome: row.result.sale_outcome, p_result_date: row.result.result_date, p_source_artifact_id: artifactIds[row.result.source_key], p_supersedes_result_id: null, p_reviewer_uid: plan.reviewer_uid }); if (error) stop(`result RPC ${salePlan.id}/${row.lot_number}: ${error.message}`); counts.results_created++; } else stop(`apply duplicate result ${salePlan.id}/${row.lot_number}`);
      processed++;
    }
  }
  return { done: true, cursor, counts };
}
async function databaseProof(client, plan) {
  const houses = await one(client, "auction_evidence_house", { slug: plan.house.slug }, "verify house"); if (houses.length !== 1) stop("verify expected one Monaco house");
  const sales = []; for (const salePlan of plan.sales) { const found = await query(client.from("auction_evidence_sale").select("id").eq("house_id", houses[0].id).eq("source_url", salePlan.sale.landing_url), `verify Sale ${salePlan.id}`); if (found.length !== 1) stop(`verify Sale ${salePlan.id}`); const lots = await query(client.from("auction_evidence_lot").select("id").eq("sale_id", found[0].id), `verify lots ${salePlan.id}`); const results = lots.length ? await query(client.from("auction_evidence_result").select("sale_outcome").in("lot_id", lots.map((x) => x.id)).eq("is_current", true), `verify results ${salePlan.id}`) : []; sales.push({ id: salePlan.id, sale_id: found[0].id, lot_count: lots.length, result_count: results.length, outcomes: Object.fromEntries(["sold", "passed", "withdrawn", "unsold"].map((o) => [o, results.filter((r) => r.sale_outcome === o).length])) }); }
  return { house_id: houses[0].id, sales };
}
async function main() {
  const mode = process.argv.includes("--dry-run") ? "dry-run" : process.argv.includes("--apply") ? "apply" : null, planPath = arg("plan");
  if (!mode || !planPath) stop("use --dry-run|--apply --plan <external path>");
  const manifests = loadManifests();
  if (mode === "dry-run") { const harvested = await Promise.all(manifests.map(harvest)), plan = await makePlan(harvested, db()), bytes = JSON.stringify(plan, null, 2) + "\n"; fs.writeFileSync(planPath, bytes); console.log(JSON.stringify({ mode, ok: true, plan_sha256: hash(bytes), summary: plan.summary, sales: harvested.map((h) => ({ id: h.manifest.sale.id, semantic_digest: h.landing_digest, rows: h.rows.length })) }, null, 2)); return; }
  const bytes = fs.readFileSync(planPath), plan = JSON.parse(bytes), current = manifests.map((m) => ({ id: m.sale.id, hash: hash(fs.readFileSync(m.__file)) })); if (!same(plan.manifests, current)) stop("manifest changed after dry-run"); const client = db(), applied = await apply(plan, client), proof = await databaseProof(client, plan); console.log(JSON.stringify({ mode, ok: true, plan_sha256: hash(bytes), applied, proof }, null, 2));
}
/* Server-seam names for the shared engine. The CLI keeps its own private
   names; these are the same functions, not copies. */
export { makePlan as buildMonacoPlan, apply as applyMonacoPlan, databaseProof as verifyMonacoAppliedState, artifacts as buildMonacoArtifactSpecs, house as monacoHouse };
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main().catch((error) => { console.error(`STOP: ${error.message}`); process.exit(1); });
