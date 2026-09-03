/* ════════════════════════════════════════════════════════════════════════
   MONACO PORTABLE CORE — lib/auction-operations/monaco-portable-core.mjs

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "This is the ET37 importer."

   It is not. ET37 is the first PACKET this family carries; the family
   itself is a PROFILE — a named artifact shape with governed semantics —
   and the profile does not know what ET37 is. Nothing in this module reads
   a sale code to decide whether a keeper is acceptable. A keeper of a
   different sale with different counts and a different total passes the
   same profile validation; what refuses it as ET37 is the ET37 packet's
   descriptor gates, which live in the catalog row, not here.

   Two things, kept apart on purpose:

     PROFILE   validatePortableProfile()   structural / semantic. Reusable.
     PACKET    reconcilePortableGates()    sale-specific. One packet, one
                                           set of pinned expectations.

   Collapsing them — an `if (sale_code === "ET37")` anywhere in the profile
   — would turn a reusable adapter into a disguised one-sale importer, and
   the suite carries a non-ET37 fixture precisely to catch that.

   ── WHAT THIS FAMILY IS ────────────────────────────────────────────────
   The accepted, reconciled Monaco keeper artifacts are a distinct governed
   evidence contract: not raw Monaco source-page acquisition (monaco-legend)
   and not the Layer 2 corpus JSONL (monaco-layer2). Portable keepers carry
   their own reconciliation, their own source manifest and their own
   price-basis governance, already adjudicated. This core VERIFIES those
   claims against the lots themselves before it believes them.

   ── PROFILES ARE ADDITIVE AND NAMED ────────────────────────────────────
   One profile exists: `monaco-portable-reconciled-sale-v1`, the shape the
   accepted ET37 keeper proved. A later keeper with a materially different
   shape gets a NEW named profile with its own validator and its own tests.
   Do not widen this one until it accepts the next artifact; a profile may
   change only for bug fixes that keep already-accepted shapes truthful.

   ── THE PLAN STATES ITS OWN EXECUTABILITY ──────────────────────────────
   This module builds a deterministic plan and nothing else; it never
   writes. Since v8.25 the family has a writer (monaco-portable-writer.mjs)
   and the dispatcher names it. Whether a given plan may execute is written
   into that plan's own hashed bytes at generation time (`applyWithheld`
   below, fed by the family gate): a plan generated while the family was
   plan-only says no, forever, and the route and the writer both honour
   that. Lifting the gate therefore requires a fresh plan and a fresh hash.

   ── EVIDENCE COMPLETENESS ──────────────────────────────────────────────
   The keeper holds more than Auction Evidence has columns for. Every
   category is classified in the plan — carried, retained privately, or not
   carried with a stated reason — so that nothing accepted can disappear
   silently between validation and planning.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import crypto from "node:crypto";

const FOUNDER_UID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export const PORTABLE_ADAPTER_ID = "monaco-portable";
export const PORTABLE_PROFILE_V1 = "monaco-portable-reconciled-sale-v1";

/** The durable private home for exact keeper bytes, content-addressed by
    SHA-256. The object identity IS the keeper hash; nothing else may be
    written to a path once it holds different bytes. */
export const PRIVATE_KEEPER_BUCKET = "auction-evidence-private-keepers";
export const keeperObjectPath = (sha256Hex) => `sha256/${sha256Hex}.json`;

/** The ruled rights/retention posture for a retained portable keeper row:
    the exact bytes stay private and are retained as internal evidence;
    normalized facts may join the already-governed Monaco factual lane; no
    photograph, catalogue prose or raw keeper body becomes public here. */
export const PRIVATE_KEEPER_RIGHTS = Object.freeze({
  intake_method: "founder_supplied_file",
  permission_status: "unresolved",
  publication_status: "internal_only",
  public_use_scope: "normalized_facts_only",
  artifact_retention_scope: "full_artifact_private",
  automation_status: "not_applicable",
});

/** The outcome vocabulary this profile supports. `unsold` is its own state
    and is never collapsed into `passed`. Anything else fails visibly. */
export const PORTABLE_OUTCOMES = ["sold", "unsold", "withdrawn"];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function refuse(code, detail) { throw new Error(`${code}: ${detail}`); }
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string" && v.trim() !== "";
const isInt = (v) => Number.isInteger(v) && v >= 0;

function textOrNull(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

// ── keeper byte authority ────────────────────────────────────────────────

/**
 * The only way bytes become a keeper. Hash the EXACT bytes, compare to the
 * pinned expectation, and only then parse — the parsed value is derived
 * from the bytes the hash covered and from nothing else. Never hash one
 * representation and parse another; never pretty-print before hashing.
 */
export function verifyKeeperBytes(bytes, expectedSha256) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) refuse("keeper_empty", "no keeper bytes were provided");
  const actual = sha256(bytes);
  if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/.test(expectedSha256))
    refuse("keeper_hash_unpinned", "the packet descriptor pins no keeper sha256");
  if (actual !== expectedSha256)
    refuse("keeper_hash_mismatch", `staged keeper hashes to ${actual}, packet pins ${expectedSha256}`);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    refuse("keeper_unparseable", "verified bytes are not JSON");
  }
  if (!isObj(parsed)) refuse("keeper_not_an_object", "verified keeper is not a JSON object");
  return { keeper: parsed, sha256: actual, byteLength: bytes.length };
}

// ── PROFILE — structural / semantic, sale-agnostic ───────────────────────

/**
 * Validate a keeper against profile v1. Returns a normalized VIEW computed
 * from the lots themselves — never copied from the keeper's own summary
 * counts, which are checked against that view rather than trusted.
 *
 * Deliberately absent from this function: any sale code, any lot count,
 * any monetary total. Those are packet gates.
 */
export function validatePortableProfile(keeper) {
  if (!isObj(keeper)) refuse("portable_profile_refused", "keeper is not an object");

  // ── envelope ──
  const a = keeper.artifact;
  if (!isObj(a)) refuse("portable_profile_refused", "artifact envelope missing");
  if (a.artifact_type !== "auction_sale_reconciliation")
    refuse("portable_profile_refused", `artifact_type ${JSON.stringify(a.artifact_type)} is not auction_sale_reconciliation`);
  if (a.artifact_version !== "v1")
    refuse("portable_profile_refused", `artifact_version ${JSON.stringify(a.artifact_version)} is not v1`);
  if (!isObj(a.source_lock) || a.source_lock.official_house_sources_only !== true)
    refuse("portable_profile_refused", "source_lock.official_house_sources_only must be true");
  if (a.source_lock.third_party_sources_used === true)
    refuse("portable_profile_refused", "profile v1 does not admit third-party sources");

  const s = keeper.sale;
  if (!isObj(s)) refuse("portable_profile_refused", "sale block missing");
  for (const k of ["house", "sale_code", "governed_sale_label", "date", "auction_url", "currency", "location_raw"]) {
    if (!isStr(s[k])) refuse("portable_profile_refused", `sale.${k} missing`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date)) refuse("portable_profile_refused", `sale.date ${s.date} is not ISO`);
  if (!/^https:\/\//.test(s.auction_url)) refuse("portable_profile_refused", "sale.auction_url must be https");

  const g = keeper.price_basis_governance;
  if (!isObj(g) || !isStr(g.sold_fwt_price_basis))
    refuse("portable_profile_refused", "price_basis_governance.sold_fwt_price_basis missing");
  if (g.forbidden_other_basis_emitted === true)
    refuse("portable_profile_refused", "keeper admits emitting a forbidden 'other' basis");
  if (g.basis_inference_from_other_sales === true)
    refuse("portable_profile_refused", "keeper admits inferring basis from other sales");

  const c = keeper.counts;
  if (!isObj(c)) refuse("portable_profile_refused", "counts block missing");
  for (const k of ["catalogue_records", "sold", "unsold", "withdrawn"]) {
    if (!isInt(c[k])) refuse("portable_profile_refused", `counts.${k} is not a non-negative integer`);
  }

  const r = keeper.reconciliation;
  if (!isObj(r) || !isObj(r.sold_result_sum) || !isInt(r.sold_result_sum.amount) || !isStr(r.sold_result_sum.currency))
    refuse("portable_profile_refused", "reconciliation.sold_result_sum missing");

  if (!Array.isArray(keeper.lots) || keeper.lots.length === 0)
    refuse("portable_profile_refused", "lots must be a non-empty array");

  // ── lots: literal identity, outcomes, results ──
  const seenIds = new Set();
  const seenUrls = new Set();
  let sold = 0, unsold = 0, withdrawn = 0, soldTotal = 0, offered = 0;
  const currency = s.currency;
  const soldBasis = g.sold_fwt_price_basis;

  keeper.lots.forEach((lot, i) => {
    if (!isObj(lot)) refuse("portable_profile_refused", `lot[${i}] is not an object`);
    if (!isStr(lot.lot_id)) refuse("portable_profile_refused", `lot[${i}] has no lot_id`);
    if (seenIds.has(lot.lot_id)) refuse("portable_profile_refused", `duplicate lot_id ${lot.lot_id}`);
    seenIds.add(lot.lot_id);
    if (!isStr(lot.canonical_url) || !/^https:\/\//.test(lot.canonical_url))
      refuse("portable_profile_refused", `lot ${lot.lot_id} has no https canonical_url`);
    if (seenUrls.has(lot.canonical_url)) refuse("portable_profile_refused", `duplicate canonical_url on lot ${lot.lot_id}`);
    seenUrls.add(lot.canonical_url);
    if (typeof lot.offered !== "boolean") refuse("portable_profile_refused", `lot ${lot.lot_id} offered is not boolean`);
    if (!PORTABLE_OUTCOMES.includes(lot.outcome))
      refuse("portable_profile_refused", `lot ${lot.lot_id} outcome ${JSON.stringify(lot.outcome)} is not supported`);
    if (!isStr(lot.brand)) refuse("portable_profile_refused", `lot ${lot.lot_id} has no brand`);
    if (!isObj(lot.result)) refuse("portable_profile_refused", `lot ${lot.lot_id} has no result block`);

    if (lot.outcome === "withdrawn" && lot.offered !== false)
      refuse("portable_profile_refused", `withdrawn lot ${lot.lot_id} is marked offered`);
    if (lot.outcome !== "withdrawn" && lot.offered !== true)
      refuse("portable_profile_refused", `${lot.outcome} lot ${lot.lot_id} is marked not offered`);

    if (lot.outcome === "sold") {
      const amt = lot.result.amount;
      if (!Number.isInteger(amt) || amt <= 0)
        refuse("portable_profile_refused", `sold lot ${lot.lot_id} has no positive integer result amount`);
      if (lot.result.currency !== currency)
        refuse("portable_profile_refused", `sold lot ${lot.lot_id} currency ${lot.result.currency} is not the sale currency ${currency}`);
      if (lot.fwt_price_basis !== soldBasis)
        refuse("portable_profile_refused", `sold lot ${lot.lot_id} basis ${lot.fwt_price_basis} is not the governed ${soldBasis}`);
      sold += 1; soldTotal += amt; offered += 1;
    } else {
      /* No invented price triplet on a non-sold row. */
      if (lot.result.amount !== null && lot.result.amount !== undefined)
        refuse("portable_profile_refused", `${lot.outcome} lot ${lot.lot_id} carries a result amount`);
      if (lot.result.currency !== null && lot.result.currency !== undefined)
        refuse("portable_profile_refused", `${lot.outcome} lot ${lot.lot_id} carries a result currency`);
      if (lot.fwt_price_basis !== null && lot.fwt_price_basis !== undefined)
        refuse("portable_profile_refused", `${lot.outcome} lot ${lot.lot_id} carries a price basis`);
      if (lot.outcome === "unsold") { unsold += 1; offered += 1; } else { withdrawn += 1; }
    }
  });

  /* The keeper's own summary must agree with its own lots. A keeper that
     says 156 sold while its rows say 155 is refused here, before any packet
     gate — this is internal consistency, not a sale-specific expectation. */
  const computed = { catalogue_records: keeper.lots.length, offered, sold, unsold, withdrawn, sold_total: soldTotal };
  for (const k of ["catalogue_records", "sold", "unsold", "withdrawn"]) {
    if (c[k] !== computed[k])
      refuse("portable_profile_refused", `keeper counts.${k}=${c[k]} but its lots compute ${computed[k]}`);
  }
  if (r.sold_result_sum.amount !== soldTotal || r.sold_result_sum.currency !== currency)
    refuse("portable_profile_refused", `keeper reconciliation.sold_result_sum ${r.sold_result_sum.amount} ${r.sold_result_sum.currency} but lots compute ${soldTotal} ${currency}`);
  if (isObj(c) && Array.isArray(c.numeric_lot_identifier_gaps) && c.numeric_lot_identifier_gaps.length > 0)
    refuse("portable_profile_refused", "keeper declares numeric lot identifier gaps; profile v1 requires none");

  return {
    profile: PORTABLE_PROFILE_V1,
    house: s.house,
    sale: {
      code: s.sale_code,
      name: s.governed_sale_label,
      date: s.date,
      location: s.location_raw,
      currency,
      canonical_auction_url: s.auction_url,
    },
    price_basis: soldBasis,
    computed,
    canonical_urls_unique: seenUrls.size === keeper.lots.length,
  };
}

// ── PACKET GATES — sale-specific, from the descriptor ────────────────────

/**
 * Reconcile the profile view against the packet's pinned expectations.
 * Every gate is recorded with expected / actual / pass so the plan carries
 * the proof, and ANY failure is a refusal — never a warning.
 */
export function reconcilePortableGates(view, gates) {
  if (!isObj(gates)) refuse("portable_gate_mismatch", "packet descriptor carries no gates");
  const checks = [];
  const gate = (name, expected, actual) => {
    const pass = JSON.stringify(expected) === JSON.stringify(actual);
    checks.push({ check: name, expected, actual, pass });
  };
  gate("sale_code", gates.sale_code, view.sale.code);
  gate("canonical_auction_url", gates.canonical_auction_url, view.sale.canonical_auction_url);
  gate("lot_count", gates.lot_count, view.computed.catalogue_records);
  gate("sold", gates.sold, view.computed.sold);
  gate("unsold", gates.unsold, view.computed.unsold);
  gate("withdrawn", gates.withdrawn, view.computed.withdrawn);
  gate("sold_total", gates.sold_total, { amount: view.computed.sold_total, currency: view.sale.currency });
  gate("currency", gates.currency, view.sale.currency);
  gate("price_basis", gates.price_basis, view.price_basis);
  gate("canonical_urls_unique", true, view.canonical_urls_unique);
  const failed = checks.filter((c) => !c.pass);
  if (failed.length > 0) {
    refuse(
      "portable_gate_mismatch",
      failed.map((f) => `${f.check} expected ${JSON.stringify(f.expected)} actual ${JSON.stringify(f.actual)}`).join("; ")
    );
  }
  return checks;
}

// ── normalization into the shared row vocabulary ─────────────────────────

export function normalizePortableRows(keeper, view) {
  return [...keeper.lots]
    .sort((a, b) => {
      const na = Number(a.lot_id), nb = Number(b.lot_id);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.lot_id).localeCompare(String(b.lot_id));
    })
    .map((lot) => {
      const sold = lot.outcome === "sold";
      return {
        lot_number: lot.lot_id,
        brand_text: textOrNull(lot.brand),
        model_text: textOrNull(lot.model),
        reference_text: textOrNull(lot.reference),
        /* No title exists in the keeper. Nothing is composed to fill one —
           unknown remains unknown. */
        description: null,
        /* Factual source identity preserved for a future writer, with NO
           canonical Vault resolution attempted here. */
        source_identity: {
          lot_identifier_raw: textOrNull(lot.lot_identifier_raw),
          session: textOrNull(lot.session),
          offered: lot.offered,
          year: textOrNull(lot.year),
          estimate: isObj(lot.estimate) ? lot.estimate : null,
          specs_source_stated: isObj(lot.specs_source_stated) ? lot.specs_source_stated : {},
          canonical_url: lot.canonical_url,
          detail_capture_provenance: textOrNull(lot.detail_capture_provenance),
          result_wording: textOrNull(lot.result?.house_result_wording),
          source_state_note: textOrNull(lot.source_state_note),
        },
        result: {
          sale_outcome: lot.outcome,
          price_realized: sold ? lot.result.amount : null,
          currency: sold ? lot.result.currency : null,
          price_basis: sold ? lot.fwt_price_basis : null,
          result_date: view.sale.date,
          source_key: "portable_keeper",
        },
        source_key: "portable_keeper",
        lot_action: "create",
        result_action: "create_via_rpc",
      };
    });
}

// ── evidence completeness delta ──────────────────────────────────────────

/**
 * Every meaningful evidence category the keeper holds, classified. The
 * property this exists to prove: nothing accepted disappears silently.
 * `destination` names where a future writer would put it, or states that
 * no column exists and the private keeper is the retention path.
 */
export function evidenceCompletenessDelta(keeper) {
  const lots = keeper.lots ?? [];
  const has = (f) => lots.some(f);
  const rows = [];
  const add = (category, keeper_contains, plan_carries, destination, reason) =>
    rows.push({ category, keeper_contains, plan_carries, destination, reason });

  add("literal_lot_identity", true, "rows[].lot_number + source_identity.lot_identifier_raw",
      "auction_evidence_lot.lot_number", "carried");
  add("brand_model_reference", true, "rows[].brand_text/model_text/reference_text",
      "auction_evidence_lot.brand_text/model_text/reference_text", "carried");
  add("outcome", true, "rows[].result.sale_outcome",
      "auction_evidence_result.sale_outcome (via the governed RPC)", "carried");
  add("sold_result_amount_currency_basis", true, "rows[].result.price_realized/currency/price_basis",
      "auction_evidence_result (via the governed RPC)", "carried");
  add("house_result_wording", has((l) => l.result?.house_result_wording), "rows[].source_identity.result_wording",
      "none — no column", "retained: private keeper + plan; surfaced in artifact price_basis_statement");
  add("estimate_low_high_raw_qualifier", has((l) => isObj(l.estimate)), "rows[].source_identity.estimate",
      "none — no column", "retained: private keeper + plan");
  add("unusual_estimate_wording", has((l) => l.estimate?.unusual_estimate_wording_raw), "rows[].source_identity.estimate.unusual_estimate_wording_raw",
      "none — no column", "retained: private keeper + plan");
  add("year", has((l) => l.year), "rows[].source_identity.year",
      "none — no column", "retained: private keeper + plan");
  add("specs_source_stated", has((l) => isObj(l.specs_source_stated) && Object.keys(l.specs_source_stated).length), "rows[].source_identity.specs_source_stated",
      "none — no column", "retained: private keeper + plan");
  add("session", has((l) => l.session), "rows[].source_identity.session",
      "none — no column", "retained: private keeper + plan");
  add("per_lot_canonical_url", true, "rows[].source_identity.canonical_url",
      "none — source_artifact is per-sale, not per-lot", "retained: private keeper + plan");
  add("detail_capture_provenance", has((l) => l.detail_capture_provenance), "rows[].source_identity.detail_capture_provenance + sale artifact attribution_note",
      "auction_evidence_source_artifact.attribution_note (sale-level summary only)", "carried at sale level; per-lot detail retained in plan");
  add("source_state_notes", has((l) => l.source_state_note), "rows[].source_identity.source_state_note",
      "none — no column", "retained: private keeper + plan");
  add("source_anomalies", Array.isArray(keeper.source_anomalies) && keeper.source_anomalies.length > 0, "provenance.source_anomalies (verbatim)",
      "none — no column", "retained: private keeper + plan; count surfaced in summary");
  add("reconciliation_and_manifest", isObj(keeper.reconciliation), "gates_reconciliation + provenance.keeper_reconciliation_manifest",
      "not a sale fact — plan-level proof", "carried as proof");
  add("source_manifest", isObj(keeper.source_manifest), "provenance.source_manifest_summary",
      "auction_evidence_source_artifact.attribution_note (summary)", "carried as summary; per-lot page list retained in keeper");
  add("price_basis_governance", isObj(keeper.price_basis_governance), "provenance.price_basis_governance",
      "auction_evidence_source_artifact.price_basis_statement", "carried");
  add("sessions_and_house_published_figures", isObj(keeper.sale) && (Array.isArray(keeper.sale.sessions) || isObj(keeper.sale.house_published_total)), "provenance.house_published",
      "none — no column", "retained: private keeper + plan");
  add("artifact_hard_boundaries", isObj(keeper.artifact?.hard_boundaries), "not carried",
      "not applicable", "not carried: assertions about the keeper's own generation process, not sale evidence; retained in the private keeper");
  return rows;
}

// ── the plan ─────────────────────────────────────────────────────────────

async function q(request, label) {
  const { data, error } = await request;
  if (error) refuse("live_read_failed", `${label}: ${error.message}`);
  return data;
}

/**
 * Build the deterministic plan. ZERO Auction Evidence writes. The live
 * database is READ to detect collisions; a collision is a contradiction
 * recorded on the plan (which makes it unapplyable), never repaired.
 *
 * `keeper` must be the value returned by verifyKeeperBytes — parsed from
 * the bytes the hash covered.
 */
/* `applyWithheld` is what the plan SAYS about Apply, and it must match what
   the dispatcher DOES: the plan engine passes isApplyWithheld() for the
   family at generation time. The default is the conservative truth — a
   caller that forgets produces a plan claiming Apply is withheld, never one
   claiming more than the gate allows. The value is part of the hashed plan
   bytes, which is why lifting the gate requires a fresh plan. */
export async function buildPortablePlan({ manifest, keeper, keeperSha256, keeperByteLength, db, packetId, applyWithheld = true }) {
  if (!isObj(manifest) || !isObj(manifest.keeper) || manifest.keeper.sha256 !== keeperSha256)
    refuse("keeper_hash_mismatch", "plan requested for a keeper the packet does not pin");

  const view = validatePortableProfile(keeper);
  const gates = reconcilePortableGates(view, manifest.gates);
  const contradictions = [];

  // ── house ──
  const house = { ...manifest.house };
  const existingHouse = await q(
    db.from("auction_evidence_house").select("id,name,slug,website_url").eq("slug", house.slug),
    "house query"
  );
  if (existingHouse.length > 1) contradictions.push(`house: duplicate rows for slug ${house.slug}`);
  if (existingHouse.length === 1 && (existingHouse[0].name !== house.name || existingHouse[0].website_url !== house.website_url))
    contradictions.push(`house: existing ${house.slug} row differs from the packet (name/website)`);
  if (view.house !== house.name)
    contradictions.push(`house: keeper says "${view.house}", packet says "${house.name}"`);

  // ── sale collision (expected absent for a first pilot) ──
  let existingSale = [];
  if (existingHouse.length === 1) {
    existingSale = await q(
      db.from("auction_evidence_sale").select("id,sale_name,sale_date,location,source_url")
        .eq("house_id", existingHouse[0].id).eq("source_url", view.sale.canonical_auction_url),
      "sale query"
    );
    if (existingSale.length > 0)
      contradictions.push(`sale: ${view.sale.code} already exists in Auction Evidence (${existingSale.length} row) — this plan expected absence`);
  }

  const rows = normalizePortableRows(keeper, view);

  /* ── SOURCE ARTIFACTS — two objects, and the hash describes the right one ─
     `sale_page`      the official Monaco sale URL. URL-backed, content_hash
                      NULL because this flight never fetched that page.
     `portable_keeper` the exact accepted private keeper. NO URL — it is not
                      a webpage and its hash must never sit on one — and the
                      keeper hash as content_hash, retained privately at a
                      deterministic content-addressed path. The rows that
                      say source_key "portable_keeper" point HERE: this is
                      the byte artifact the adapter actually parsed.
     No timestamp is written into either spec; retrieved_at is the writer's
     to assign when the object is actually retained. */
  const g = keeper.price_basis_governance;
  const artifactSpecs = [
    {
      key: "sale_page",
      source_url: view.sale.canonical_auction_url,
      content_hash: null,
      intake_method: "public_file",
      permission_status: "unresolved",
      publication_status: "internal_only",
      public_use_scope: "none",
      artifact_retention_scope: "metadata_only",
      full_artifact_storage_path: null,
      automation_status: "not_applicable",
      attribution_note:
        `Official ${house.name} sale page for ${view.sale.name} (${view.sale.code}); ` +
        `${keeper.source_manifest?.source_count?.canonical_lot_pages ?? "n/a"} canonical lot pages on the official domain only. ` +
        `Supporting source metadata for the accepted private keeper (sha256 ${keeperSha256}), which is a separate retained artifact; this page's hash is not the keeper's.`,
      price_basis_statement:
        `${g.sold_result_basis_evidence ?? ""} Sold amounts recorded under price_basis '${view.price_basis}' exactly as the house labels them; no arithmetic transform. Non-sold rows carry no price, currency or basis.`,
      omission_statement:
        "Raw Monaco HTML and images are not retained on this artifact. Normalized facts derive from the accepted private keeper, retained separately as its own artifact.",
    },
    {
      key: "portable_keeper",
      source_url: null,
      content_hash: keeperSha256,
      ...PRIVATE_KEEPER_RIGHTS,
      full_artifact_storage_path: keeperObjectPath(keeperSha256),
      attribution_note:
        `Accepted reconciled private keeper for ${view.sale.name} (${view.sale.code}), ${house.name}: ` +
        `${keeper.artifact.artifact_type} ${keeper.artifact.artifact_version}, ${keeperByteLength} bytes, sha256 ${keeperSha256}. ` +
        `Reconciled from official house sources only (${keeper.source_manifest?.source_count?.canonical_lot_pages ?? "n/a"} canonical lot pages); it is the exact byte artifact this adapter parsed.`,
      price_basis_statement:
        `Sold results carry price_basis '${view.price_basis}' exactly as the keeper records the house's own labels; no arithmetic transform, no basis inferred from other sales.`,
      omission_statement:
        "The exact keeper bytes are retained privately as internal evidence and are not public. Normalized factual identity and results may join the governed Monaco factual-publication lane; photographs, catalogue prose and the raw keeper body do not become public through this artifact.",
    },
  ];

  const anomalies = Array.isArray(keeper.source_anomalies) ? keeper.source_anomalies : [];
  const delta = evidenceCompletenessDelta(keeper);
  const withheldReason = "monaco-portable is a plan-only family: no writer exists and Apply is refused by name in the dispatcher.";

  const plan = {
    version: 1,
    adapter: PORTABLE_ADAPTER_ID,
    profile: PORTABLE_PROFILE_V1,
    packet_id: packetId ?? null,
    reviewer_uid: FOUNDER_UID,
    keeper: {
      sha256: keeperSha256,
      byte_length: keeperByteLength,
      preferred_filename: textOrNull(keeper.artifact?.preferred_filename),
      artifact_type: keeper.artifact.artifact_type,
      artifact_version: keeper.artifact.artifact_version,
      generated_utc: textOrNull(keeper.artifact?.generated_utc),
      retention: `PRIVATE_KEEPER_ARTIFACT — retained at Apply to ${PRIVATE_KEEPER_BUCKET}/${keeperObjectPath(keeperSha256)}; ${applyWithheld ? "Apply is withheld for this family" : "Apply is released for this family"}`,
      source_artifact_representation: "portable_keeper artifact spec: source_url null, content_hash = keeper sha256, full_artifact_private",
    },
    house,
    sale: view.sale,
    gates_reconciliation: gates,
    sales: [
      {
        id: view.sale.code,
        sale: {
          id: view.sale.code,
          name: view.sale.name,
          date: view.sale.date,
          location: view.sale.location,
          currency: view.sale.currency,
          landing_url: view.sale.canonical_auction_url,
        },
        artifact_specs: artifactSpecs,
        rows,
      },
    ],
    provenance: {
      source_lock: keeper.artifact.source_lock,
      source_manifest_summary: {
        sale_page_url: keeper.source_manifest?.sale_page?.url ?? null,
        canonical_lot_pages: keeper.source_manifest?.source_count?.canonical_lot_pages ?? null,
        official_domain_only: keeper.source_manifest?.official_domain_only ?? null,
        third_party_sources: Array.isArray(keeper.source_manifest?.third_party_sources) ? keeper.source_manifest.third_party_sources.length : null,
      },
      price_basis_governance: g,
      house_published: {
        total: keeper.sale.house_published_total ?? null,
        sold_rate: keeper.sale.house_published_sold_rate ?? null,
        catalogue_lot_count: keeper.sale.house_published_catalogue_lot_count ?? null,
        sessions: keeper.sale.sessions ?? null,
      },
      keeper_reconciliation: keeper.reconciliation,
      keeper_reconciliation_manifest: keeper.reconciliation_manifest ?? null,
      source_anomalies: anomalies,
    },
    evidence_completeness_delta: delta,
    contradictions,
    apply: applyWithheld
      ? { enabled: false, reason: withheldReason }
      : { enabled: true, reason: "Apply is released for monaco-portable: applyPortablePlanSlice retains the exact keeper privately, then writes this plan through the protected result RPC. Apply remains a separate, explicit, exact-hash act." },
    summary: {
      adapter: PORTABLE_ADAPTER_ID,
      profile: PORTABLE_PROFILE_V1,
      house: house.name,
      sale: view.sale.name,
      sale_code: view.sale.code,
      sale_date: view.sale.date,
      keeper_sha256: keeperSha256,
      keeper_bytes: keeperByteLength,
      lot_count: view.computed.catalogue_records,
      sold: view.computed.sold,
      unsold: view.computed.unsold,
      withdrawn: view.computed.withdrawn,
      sold_total: view.computed.sold_total,
      currency: view.sale.currency,
      price_basis: view.price_basis,
      house_row: existingHouse.length === 1 ? "reuse" : existingHouse.length === 0 ? "create" : "CONFLICT",
      sale_row: existingSale.length === 0 ? "create" : "CONFLICT",
      lots_create: rows.length,
      results_create: rows.length,
      source_anomalies: anomalies.length,
      evidence_categories_carried: delta.filter((d) => d.reason === "carried" || d.reason.startsWith("carried")).length,
      evidence_categories_retained_only: delta.filter((d) => d.reason.startsWith("retained")).length,
      evidence_categories_not_carried: delta.filter((d) => d.reason.startsWith("not carried")).length,
      contradictions: contradictions.length,
      apply_state: applyWithheld ? "WITHHELD — plan-only family, no writer exists" : "AVAILABLE — Apply is a separate exact-hash act",
    },
  };
  return plan;
}

export function portablePlanToBytes(plan) {
  return JSON.stringify(plan, null, 2) + "\n";
}

export { sha256 as portableSha256 };
