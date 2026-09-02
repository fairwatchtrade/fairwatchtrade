/* ════════════════════════════════════════════════════════════════════════
   MONACO PORTABLE WRITER — lib/auction-operations/monaco-portable-writer.mjs

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "It is a Monaco plan, so the Monaco writer can apply it."

   It cannot, and not because the row shapes differ — they were made to
   match. It cannot because the Monaco writer resolves artifacts by
   (sale_id, source_url), and the artifact this family depends on has NO
   URL. It is the exact private keeper file, retained by content hash. A
   writer that reached it by URL would either fail to find it or, worse,
   find something else. So this family has its own writer, dispatched by
   name, never by falling through.

   ── THE ORDER OF OPERATIONS IS THE INVARIANT ───────────────────────────
   Storage and Postgres do not share a transaction. The safe shape is:

     verified durable keeper object FIRST → DB row referencing it SECOND.

   A content-addressed object that exists after a later DB refusal is
   acceptable orphan storage: it can be verified and reused. A DB row that
   points at a path whose exact object was never verified is not acceptable
   under any circumstance. Nothing below inserts the keeper artifact row, a
   lot, or a result until the keeper bytes have been rehashed, compared to
   the plan, and found durably retained at their hash path.

   ── WHAT THIS WRITER IS NOT ────────────────────────────────────────────
   Not release authority. `monaco-portable` remains in APPLY_WITHHELD_ADAPTERS
   and applyDispatchFor() refuses it by name; the route and the room never
   reach this file. It is exercised by direct controlled tests until a
   separately authorised release removes the family from the withheld set —
   and that release must add the explicit dispatch branch at the same time.

   Not a correction path. Creation and idempotent reuse only. A disagreeing
   existing row/object refuses; nothing is silently corrected. Results still
   travel only through auction_evidence_create_or_correct_result.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import crypto from "node:crypto";
import { PRIVATE_KEEPER_RIGHTS, keeperObjectPath } from "./monaco-portable-core.mjs";

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function stop(code, detail) { throw new Error(`${code}: ${detail}`); }

async function q(request, label) {
  const { data, error } = await request;
  if (error) stop("live_read_failed", `${label}: ${error.message}`);
  return data;
}

const sameLot = (a, b) =>
  a.brand_text === b.brand_text && a.model_text === b.model_text &&
  a.reference_text === b.reference_text && a.description === b.description;

const sameResult = (a, b) => {
  const samePrice = a.price_realized === null || a.price_realized === undefined
    ? b.price_realized === null
    : Number(a.price_realized) === b.price_realized;
  return a.sale_outcome === b.sale_outcome && samePrice && a.currency === b.currency && a.price_basis === b.price_basis;
};

/**
 * Retain the exact keeper bytes durably, or verify they already are.
 *
 *   rehash staged bytes → must equal the plan's keeper hash AND the
 *   portable_keeper spec's content_hash → download the object at the hash
 *   path → if present, rehash and it must match (never overwrite) → if
 *   absent, upload, then read back and verify → return the path.
 *
 * `storage` is an injected boundary: { download(path) → Buffer|null,
 * upload(path, bytes) }. Tests use an in-memory fake; a route would pass a
 * Supabase-bucket-backed one. Nothing here knows which.
 */
export async function ensureKeeperRetained({ plan, keeperBytes, storage }) {
  if (!Buffer.isBuffer(keeperBytes) || keeperBytes.length === 0) stop("keeper_bytes_required", "no staged keeper bytes were supplied");
  const spec = plan.sales?.[0]?.artifact_specs?.find((a) => a.key === "portable_keeper");
  if (!spec) stop("plan_missing_keeper_artifact", "the plan carries no portable_keeper artifact spec");

  const actual = sha256(keeperBytes);
  if (actual !== plan.keeper?.sha256) stop("keeper_hash_mismatch", `staged bytes hash to ${actual}; plan keeper is ${plan.keeper?.sha256}`);
  if (actual !== spec.content_hash) stop("keeper_hash_mismatch", `staged bytes hash to ${actual}; artifact spec pins ${spec.content_hash}`);
  const path = keeperObjectPath(actual);
  if (spec.full_artifact_storage_path !== path) stop("keeper_path_mismatch", `spec path ${spec.full_artifact_storage_path} is not the content-addressed ${path}`);

  const existing = await storage.download(path);
  if (existing) {
    const existingHash = sha256(existing);
    if (existingHash !== actual) stop("keeper_object_conflict", `object at ${path} hashes to ${existingHash}, not ${actual} - refusing to overwrite`);
    return { path, created: false };
  }

  await storage.upload(path, keeperBytes);
  const readBack = await storage.download(path);
  if (!readBack || sha256(readBack) !== actual) stop("keeper_retention_unverified", `object at ${path} could not be read back as the exact keeper bytes`);
  return { path, created: true };
}

/**
 * Apply one bounded slice of a monaco-portable plan. Same cursor/counts
 * contract as applyMonacoPlanSlice so applySlice.ts could host it when a
 * release authorises that — it does not yet.
 *
 * Required: opts.keeperBytes (the exact staged portable_json bytes) and
 * opts.storage (the durable-retention boundary). Both are refused if
 * absent; there is no path through this writer that skips retention.
 */
export async function applyPortablePlanSlice(plan, client, opts = {}) {
  const maxRows = opts.maxRows ?? Infinity;
  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const cursor = { sale_index: opts.cursor?.sale_index ?? 0, row_index: opts.cursor?.row_index ?? 0 };
  const counts = {
    lots_created: 0, lots_reused: 0, results_created: 0, results_reused: 0,
    keeper_object_created: 0, keeper_object_reused: 0,
    keeper_artifact_created: 0, keeper_artifact_reused: 0,
  };

  if (plan?.adapter !== "monaco-portable") stop("wrong_adapter", `this writer applies monaco-portable plans only, not ${String(plan?.adapter)}`);
  if (!opts.storage || typeof opts.storage.download !== "function" || typeof opts.storage.upload !== "function")
    stop("storage_boundary_required", "a durable-retention storage boundary must be supplied");
  if (Array.isArray(plan.contradictions) && plan.contradictions.length > 0)
    stop("plan_has_contradictions", plan.contradictions.join("; "));

  const reviewer = await q(client.from("profiles").select("id").eq("id", plan.reviewer_uid), "reviewer query");
  if (reviewer.length !== 1) stop("reviewer_missing", "founder profile missing; refusing to write");

  // ── house ──
  const houses = await q(client.from("auction_evidence_house").select("id,name,slug,website_url").eq("slug", plan.house.slug), "house query");
  let houseId;
  if (houses.length === 1) {
    if (houses[0].name !== plan.house.name || houses[0].website_url !== plan.house.website_url)
      stop("house_contradiction", `existing house ${plan.house.slug} differs from the plan`);
    houseId = houses[0].id;
  } else if (houses.length === 0) {
    const inserted = await q(client.from("auction_evidence_house").insert(plan.house).select("id"), "house insert");
    houseId = inserted[0].id;
  } else stop("house_duplicate", `duplicate house rows for ${plan.house.slug}`);

  let processed = 0;
  for (; cursor.sale_index < plan.sales.length; cursor.sale_index++, cursor.row_index = 0) {
    const salePlan = plan.sales[cursor.sale_index];

    // ── sale ──
    const sales = await q(
      client.from("auction_evidence_sale").select("id,sale_name,sale_date,location,source_url").eq("house_id", houseId).eq("source_url", salePlan.sale.landing_url),
      `sale ${salePlan.id}`
    );
    let saleId;
    if (sales.length === 1) {
      if (sales[0].sale_name !== salePlan.sale.name || sales[0].sale_date !== salePlan.sale.date || sales[0].location !== salePlan.sale.location)
        stop("sale_contradiction", `existing sale ${salePlan.id} differs from the plan`);
      saleId = sales[0].id;
    } else if (sales.length === 0) {
      const inserted = await q(
        client.from("auction_evidence_sale").insert({ house_id: houseId, sale_name: salePlan.sale.name, sale_date: salePlan.sale.date, location: salePlan.sale.location, source_url: salePlan.sale.landing_url }).select("id"),
        `sale ${salePlan.id} insert`
      );
      saleId = inserted[0].id;
    } else stop("sale_duplicate", `duplicate sale rows for ${salePlan.id}`);

    const artifactIds = {};
    const keeperSpec = salePlan.artifact_specs.find((a) => a.key === "portable_keeper");
    if (!keeperSpec) stop("plan_missing_keeper_artifact", `sale ${salePlan.id} carries no portable_keeper artifact spec`);

    // ── URL-backed artifacts (the official sale page), by (sale, url) ──
    for (const spec of salePlan.artifact_specs.filter((a) => a.source_url !== null)) {
      const found = await q(client.from("auction_evidence_source_artifact").select("id,content_hash").eq("sale_id", saleId).eq("source_url", spec.source_url), `artifact ${salePlan.id}/${spec.key}`);
      if (found.length === 1) {
        if (found[0].content_hash !== spec.content_hash) stop("artifact_contradiction", `${salePlan.id}/${spec.key} exists with a different hash`);
        artifactIds[spec.key] = found[0].id;
      } else if (found.length === 0) {
        const { key, ...values } = spec;
        const inserted = await q(client.from("auction_evidence_source_artifact").insert({ ...values, sale_id: saleId, retrieved_at: new Date().toISOString() }).select("id"), `artifact insert ${salePlan.id}/${key}`);
        artifactIds[key] = inserted[0].id;
      } else stop("artifact_duplicate", `${salePlan.id}/${spec.key} has duplicate rows`);
    }

    /* ── THE KEEPER: durable object FIRST, then the row ─────────────────
       Nothing about lots or results has been written for this sale yet, and
       nothing will be until both of these hold. */
    const retained = await ensureKeeperRetained({ plan, keeperBytes: opts.keeperBytes, storage: opts.storage });
    if (retained.created) counts.keeper_object_created += 1; else counts.keeper_object_reused += 1;

    const keepers = await q(
      client.from("auction_evidence_source_artifact")
        .select("id,content_hash,full_artifact_storage_path,intake_method,permission_status,publication_status,public_use_scope,artifact_retention_scope,automation_status")
        .eq("sale_id", saleId).is("source_url", null).eq("content_hash", keeperSpec.content_hash).eq("artifact_retention_scope", "full_artifact_private"),
      `keeper artifact ${salePlan.id}`
    );
    if (keepers.length === 1) {
      const k = keepers[0];
      const agrees =
        k.full_artifact_storage_path === retained.path &&
        Object.entries(PRIVATE_KEEPER_RIGHTS).every(([col, v]) => k[col] === v);
      if (!agrees) stop("keeper_artifact_contradiction", `existing private keeper row for ${salePlan.id} disagrees with the governed plan (path or rights)`);
      artifactIds.portable_keeper = k.id;
      counts.keeper_artifact_reused += 1;
    } else if (keepers.length === 0) {
      const { key, ...values } = keeperSpec;
      if (values.full_artifact_storage_path !== retained.path) stop("keeper_path_mismatch", "spec path does not match the retained object path");
      const inserted = await q(
        client.from("auction_evidence_source_artifact").insert({ ...values, sale_id: saleId, retrieved_at: new Date().toISOString() }).select("id"),
        `keeper artifact insert ${salePlan.id}`
      );
      artifactIds[key] = inserted[0].id;
      counts.keeper_artifact_created += 1;
    } else stop("keeper_artifact_duplicate", `more than one private keeper row for ${salePlan.id} with hash ${keeperSpec.content_hash}`);

    // ── lots and results, provenance = the keeper artifact ──
    for (; cursor.row_index < salePlan.rows.length; cursor.row_index++) {
      if (processed >= maxRows || Date.now() > deadline) return { done: false, cursor, counts };
      const row = salePlan.rows[cursor.row_index];
      const provenanceId = artifactIds[row.source_key];
      if (!provenanceId) stop("row_provenance_missing", `row ${row.lot_number} names source_key ${row.source_key} which resolved to no artifact`);

      const lots = await q(client.from("auction_evidence_lot").select("id,brand_text,model_text,reference_text,description").eq("sale_id", saleId).eq("lot_number", row.lot_number), `lot ${salePlan.id}/${row.lot_number}`);
      let lotId;
      if (lots.length === 1) {
        if (!sameLot(lots[0], row)) stop("lot_contradiction", `${salePlan.id}/${row.lot_number} exists with different facts`);
        lotId = lots[0].id; counts.lots_reused += 1;
      } else if (lots.length === 0) {
        const inserted = await q(
          client.from("auction_evidence_lot").insert({ sale_id: saleId, lot_number: row.lot_number, brand_text: row.brand_text, model_text: row.model_text, reference_text: row.reference_text, description: row.description, source_artifact_id: provenanceId }).select("id"),
          `lot insert ${salePlan.id}/${row.lot_number}`
        );
        lotId = inserted[0].id; counts.lots_created += 1;
      } else stop("lot_duplicate", `${salePlan.id}/${row.lot_number} has duplicate rows`);

      const results = await q(client.from("auction_evidence_result").select("id,sale_outcome,price_realized,currency,price_basis").eq("lot_id", lotId).eq("is_current", true), `result ${salePlan.id}/${row.lot_number}`);
      if (results.length === 1) {
        if (!sameResult(results[0], row.result)) stop("result_contradiction", `${salePlan.id}/${row.lot_number} current result differs`);
        counts.results_reused += 1;
      } else if (results.length === 0) {
        const { error } = await client.rpc("auction_evidence_create_or_correct_result", {
          p_lot_id: lotId,
          p_price_realized: row.result.price_realized,
          p_currency: row.result.currency,
          p_price_basis: row.result.price_basis,
          p_sale_outcome: row.result.sale_outcome,
          p_result_date: row.result.result_date,
          p_source_artifact_id: artifactIds[row.result.source_key],
          p_supersedes_result_id: null,
          p_reviewer_uid: plan.reviewer_uid,
        });
        if (error) stop("result_rpc_failed", `${salePlan.id}/${row.lot_number}: ${error.message}`);
        counts.results_created += 1;
      } else stop("result_duplicate", `${salePlan.id}/${row.lot_number} has more than one current result`);
      processed += 1;
    }
  }
  return { done: true, cursor, counts };
}
