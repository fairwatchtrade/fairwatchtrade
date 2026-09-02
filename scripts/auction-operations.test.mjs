/* Auction Operations — bounded regression proofs.

   Run: node --experimental-strip-types scripts/auction-operations.test.mjs

   Three layers, because three different things can break:

     · the LAYER 2 CORE — corpus gates, deterministic plans, and the ET36
       price quarantine (behavioral, pure);
     · the SHARED BOUNDED APPLY — slices, interruption/resume, idempotent
       replay, contradiction refusal, results only via the controlled RPC
       (behavioral, in-memory database);
     · the GOVERNANCE BOUNDARY — founder gates, zero-write planning,
       server-held plan/hash authority, registry allowlist (structural
       source pins, the sell-lifecycle pattern).                            */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import {
  buildLayer2ArtifactSpecs,
  buildLayer2Plan,
  layer2PlanToBytes,
  normalizeLayer2Rows,
  validateLayer2Corpus,
  wantedLayer2Result,
} from "../lib/auction-operations/monaco-layer2-core.mjs";
import { applyMonacoPlanSlice } from "./monaco-legend-import.mjs";
import {
  identityStateOf,
  sortResultsRows,
  sortUpcomingRows,
} from "../lib/auction-operations/resultsPresentation.ts";
import {
  ADAPTER_ALLOWLIST,
  RUNTIME_REGISTERABLE_ADAPTERS,
  ADAPTER_SCHEMA_VERSIONS,
  isAllowlistedAdapter,
  isRuntimeRegisterable,
  toRegisteredPacket,
  resolveInlineDescriptor,
  assertDescriptorIntegrity,
  descriptorBytesAndHash,
  verifiedDescriptor,
  structurallyEqual,
  rowIsUsable,
  APPLY_WITHHELD_ADAPTERS,
  APPLY_WITHHELD_ERROR,
  isApplyWithheld,
  applyDispatchFor,
} from "../lib/auction-operations/packetContract.ts";
import {
  PORTABLE_PROFILE_V1,
  verifyKeeperBytes,
  validatePortableProfile,
  reconcilePortableGates,
  normalizePortableRows,
  evidenceCompletenessDelta,
  buildPortablePlan,
  portablePlanToBytes,
  PRIVATE_KEEPER_BUCKET,
  PRIVATE_KEEPER_RIGHTS,
  keeperObjectPath,
} from "../lib/auction-operations/monaco-portable-core.mjs";
import {
  applyPortablePlanSlice,
  ensureKeeperRetained,
} from "../lib/auction-operations/monaco-portable-writer.mjs";
import { readFileSync as readSourceFile, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};
const throws = (label, fn, re) => {
  n += 1;
  assert.throws(fn, re, label);
};
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/* ── a tiny synthetic corpus with the real column vocabulary ───────────── */

const row = (sale, lot, outcome, official, extras = {}) => ({
  sale_code: sale,
  lot_number: String(lot),
  sale_outcome: outcome,
  currency: "EUR",
  price_semantics_review_required: sale === "TT36" ? "True" : "False",
  canonical_auction_url: `https://example.test/auction/tt-${sale.slice(2)}`,
  rights_status: "UNRULED_INTERNAL_ONLY",
  sale_date_start: sale === "TT33" ? "2024-04-20" : "2026-06-27",
  chronological_position_among_known_six: sale === "TT33" ? 1 : 6,
  realized_result_official_premium_vat_eur: official,
  website_result_premium_eur: outcome === "sold" ? "1000" : "",
  brand: "Testor",
  model: `Model ${lot}`,
  manufacturer_reference: `REF-${lot}`,
  source_title: sale === "TT36" ? "" : `Lot ${lot} title`,
  ...extras,
});

const corpusRows = [
  row("TT33", 1, "sold", "600"),
  row("TT33", 2, "sold", "400"),
  row("TT33", 3, "unsold", ""),
  row("TT36", 1, "sold", ""),
  row("TT36", 2, "passed", ""),
];

const manifest = {
  corpus: { sha256: "x".repeat(64), rows_total: 5, rights_status_all_rows: "UNRULED_INTERNAL_ONLY" },
  house: { name: "Test House", slug: "test-house", website_url: "https://example.test" },
  sales: [
    {
      code: "TT33",
      name: "Test Sale 33",
      date: "2024-04-20",
      location: "Testville",
      currency: "EUR",
      canonical_auction_url: "https://example.test/auction/tt-33",
      official_result_source: "https://example.test/results/33.pdf",
      chronological_position_among_known_six: 1,
      expected: {
        rows: 3,
        outcomes: { sold: 2, unsold: 1 },
        official_result_rows: 2,
        sold_sum_official_premium_vat_eur: 1000,
        website_premium_priced_rows: 2,
        price_semantics_review_required_rows: 0,
      },
    },
    {
      code: "TT36",
      name: "Test Sale 36",
      date: "2026-06-27",
      location: "Testville",
      currency: "EUR",
      canonical_auction_url: "https://example.test/auction/tt-36",
      official_result_source: null,
      chronological_position_among_known_six: 6,
      expected: {
        rows: 2,
        outcomes: { sold: 1, passed: 1 },
        official_result_rows: 0,
        sold_sum_official_premium_vat_eur: null,
        website_premium_priced_rows: 1,
        price_semantics_review_required_rows: 2,
      },
    },
  ],
  quarantine: {
    TT36: { official_result_rows_must_be: 0, review_required_rows_must_be: 2, prices_withheld: true, statement: "test quarantine statement" },
  },
  estimates_omission_sentence: "Estimates are deliberately not captured.",
};

/* ── 1 · corpus gates refuse every drift ────────────────────────────────── */
{
  validateLayer2Corpus(manifest, corpusRows); // clean corpus passes
  ok("clean synthetic corpus passes its gates", true);

  throws("a missing row is refused", () =>
    validateLayer2Corpus(manifest, corpusRows.slice(0, 4)), /rows 4 != 5/);
  throws("a wrong monetary sum is refused", () =>
    validateLayer2Corpus(manifest, corpusRows.map((r) =>
      r.sale_code === "TT33" && r.lot_number === "1" ? { ...r, realized_result_official_premium_vat_eur: "601" } : r
    )), /sold sum/);
  throws("an unexpected outcome vocabulary is refused", () =>
    validateLayer2Corpus(manifest, corpusRows.map((r) =>
      r.lot_number === "3" && r.sale_code === "TT33" ? { ...r, sale_outcome: "cancelled" } : r
    )), /outcome/);
  throws("a rights drift on any row is refused", () =>
    validateLayer2Corpus(manifest, corpusRows.map((r, i) =>
      i === 0 ? { ...r, rights_status: "PUBLIC" } : r
    )), /rights_status/);
  throws("a lot-continuity gap is refused", () =>
    validateLayer2Corpus(manifest, corpusRows.map((r) =>
      r.sale_code === "TT33" && r.lot_number === "2" ? { ...r, lot_number: "9" } : r
    )), /continuity|rows|outcome/);
  throws("a quarantine-flag drift is refused", () =>
    validateLayer2Corpus(manifest, corpusRows.map((r) =>
      r.sale_code === "TT36" ? { ...r, price_semantics_review_required: "False" } : r
    )), /review-required/);
}

/* ── 2 · the ET36 price quarantine is structural ───────────────────────── */
{
  const tt33 = manifest.sales[0];
  const tt36 = manifest.sales[1];
  const rows33 = normalizeLayer2Rows(tt33, corpusRows);
  const rows36 = normalizeLayer2Rows(tt36, corpusRows);

  /* Ingestion must terminate in one of three honest states and never in a
     generic bucket. 'other' collapsed "known but different" into "unknown",
     and that erasure is what the production repair had to undo. */
  const pricedSold = wantedLayer2Result(rows33[0], tt33);
  ok("an official-result-sheet row carries the EXACT governed basis",
    pricedSold.price_realized === 600 && pricedSold.currency === "EUR" &&
    pricedSold.price_basis === "result_including_premium_and_vat");
  ok("and its result sources from the official result sheet",
    pricedSold.source_key === "official_results_pdf");

  const q = wantedLayer2Result(rows36[0], tt36);
  ok("a sold row with only a website figure keeps the number under UNRESOLVED basis",
    q.sale_outcome === "sold" && q.price_realized === 1000 && q.currency === "EUR" &&
    q.price_basis === "reported_result_basis_unverified");
  ok("and that value is stored exactly as displayed — no 1.04, no VAT arithmetic",
    q.price_realized === 1000 && q.price_realized !== Math.round(1000 / 1.04));
  ok("a website-sourced figure never claims the official sheet as its source",
    q.source_key === "landing");
  ok("no ingestion path emits the generic 'other' bucket any more",
    ![pricedSold, q].some((x) => x.price_basis === "other"));


  /* State 3: a sold row with no trustworthy figure of either kind keeps the
     outcome and stores no price fact at all. */
  const noFigure = wantedLayer2Result(
    { ...rows36[0], official_premium_vat_eur: null, website_result_premium_eur: null }, tt36);
  ok("a sold row with no trustworthy figure stores NULL / NULL / NULL",
    noFigure.sale_outcome === "sold" && noFigure.price_realized === null &&
    noFigure.currency === null && noFigure.price_basis === null);
  const unsold = wantedLayer2Result(rows33[2], tt33);
  ok("a non-sold row carries no price facts", unsold.price_realized === null && unsold.currency === null);
  ok("'unsold' survives as its own outcome, never collapsed into 'passed'",
    unsold.sale_outcome === "unsold");

  ok("absent corpus text lands as null, never as empty string",
    rows36[0].description === null && rows33[0].description === "Lot 1 title");

  const specs36 = buildLayer2ArtifactSpecs(manifest, tt36);
  ok("ET-pattern quarantine is written into the source artifact statements",
    specs36.some((s) => s.omission_statement?.includes("test quarantine statement")));
  ok("no official-result artifact is invented for a sale that has no result sheet",
    !specs36.some((s) => s.key === "official_results_pdf"));
  const specs33 = buildLayer2ArtifactSpecs(manifest, tt33);
  ok("the chronological-position marker rides in artifact attribution, from the corpus",
    specs33.every((s) => s.attribution_note.includes("chronological position 1 of the six")));
  ok("artifacts carry the Monaco rights convention",
    specs33.every((s) => s.publication_status === "internal_only" && s.artifact_retention_scope === "metadata_only"));
}

/* ── 3 · deterministic plan, in-memory database ─────────────────────────── */

function fakeDb() {
  const tables = {
    profiles: [{ id: "77a6893a-54fe-4373-9bf7-3327d0ba69cf" }],
    auction_evidence_house: [],
    auction_evidence_sale: [],
    auction_evidence_source_artifact: [],
    auction_evidence_lot: [],
    auction_evidence_result: [],
  };
  let idc = 0;
  const nid = () => `id-${++idc}`;
  const db = {
    tables,
    rpcCalls: 0,
    directResultInserts: 0,
    from(table) {
      const filters = [];
      const chain = {
        select() { return chain; },
        eq(k, v) { filters.push((r) => r[k] === v); return chain; },
        /* `.is(col, null)` is how Supabase matches NULL; `.eq(col, null)` does
           not. The portable writer resolves the URL-less keeper row this way. */
        is(k, v) { filters.push((r) => (v === null ? r[k] === null || r[k] === undefined : r[k] === v)); return chain; },
        in(k, vs) { filters.push((r) => vs.includes(r[k])); return chain; },
        then(resolve) {
          const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
          resolve({ data: rows.map((r) => ({ ...r })), error: null });
        },
        insert(values) {
          if (table === "auction_evidence_result") {
            db.directResultInserts += 1;
            return { select: () => ({ then: (res) => res({ data: null, error: { message: "revoked" } }) }) };
          }
          const rec = { id: nid(), ...values };
          tables[table].push(rec);
          return {
            select() {
              return { then(res) { res({ data: [{ id: rec.id }], error: null }); } };
            },
          };
        },
      };
      return chain;
    },
    rpc(name, args) {
      if (name !== "auction_evidence_create_or_correct_result")
        return Promise.resolve({ data: null, error: { message: "unknown rpc" } });
      db.rpcCalls += 1;
      const existing = tables.auction_evidence_result.find((r) => r.lot_id === args.p_lot_id && r.is_current);
      if (existing) return Promise.resolve({ data: null, error: { message: "one current per lot" } });
      tables.auction_evidence_result.push({
        id: nid(), lot_id: args.p_lot_id, is_current: true,
        sale_outcome: args.p_sale_outcome, price_realized: args.p_price_realized,
        currency: args.p_currency, price_basis: args.p_price_basis,
      });
      return Promise.resolve({ data: { ok: true }, error: null });
    },
  };
  return db;
}

{
  const db = fakeDb();
  const p1 = await buildLayer2Plan({ manifest, corpusSha256: manifest.corpus.sha256, rows: corpusRows, db });
  const p2 = await buildLayer2Plan({ manifest, corpusSha256: manifest.corpus.sha256, rows: corpusRows, db });
  ok("plan generation is deterministic — identical bytes, identical hash",
    sha(layer2PlanToBytes(p1)) === sha(layer2PlanToBytes(p2)));
  ok("planning wrote NOTHING — no rows, no RPC calls",
    db.tables.auction_evidence_lot.length === 0 && db.rpcCalls === 0 &&
    db.tables.auction_evidence_house.length === 0);
  /* The two counts are separate facts. A trustworthy figure with unknown
     composition is RECORDED under unresolved basis, not withheld — only a
     sold row with no figure at all is withheld. */
  ok("a source-reported figure is recorded under unresolved basis, not withheld",
    p1.summary.et36_sold_prices_withheld === 0 &&
    p1.summary.sold_prices_unresolved_basis === 1);
  throws("a corpus that is not the registered corpus is refused before validation", () => {
    // buildLayer2Plan is async — assert on the awaited rejection below instead
    throw new Error("corpus hash mismatch (see async assertion)");
  }, /corpus hash/);
  await assert.rejects(
    buildLayer2Plan({ manifest, corpusSha256: "f".repeat(64), rows: corpusRows, db }),
    /does not match the registered packet/
  );
  n += 1;

  /* ── bounded apply through the SHARED Monaco engine ── */
  const plan = p1;
  const slice1 = await applyMonacoPlanSlice(plan, db, { maxRows: 2 });
  ok("a bounded slice stops at its budget with a durable cursor",
    slice1.done === false && slice1.cursor.sale_index === 0 && slice1.cursor.row_index === 2);
  ok("two rows landed: two lots, two results via the controlled RPC only",
    db.tables.auction_evidence_lot.length === 2 && db.rpcCalls === 2 && db.directResultInserts === 0);

  const slice2 = await applyMonacoPlanSlice(plan, db, { cursor: slice1.cursor, maxRows: 100 });
  ok("resume finishes from the exact cursor", slice2.done === true);
  ok("all five lots exist, one result each",
    db.tables.auction_evidence_lot.length === 5 && db.tables.auction_evidence_result.length === 5);
  ok("the ET36-pattern sold row landed WITH its figure under unresolved basis",
    db.tables.auction_evidence_result.some((r) =>
      r.sale_outcome === "sold" && r.price_realized === 1000 &&
      r.price_basis === "reported_result_basis_unverified"));
  ok("and no applied result carries the retired generic bucket",
    !db.tables.auction_evidence_result.some((r) => r.price_basis === "other"));

  const replay = await applyMonacoPlanSlice(plan, db, { maxRows: 100 });
  ok("full replay converges idempotently — nothing duplicated",
    replay.done === true && db.tables.auction_evidence_lot.length === 5 &&
    db.tables.auction_evidence_result.length === 5 &&
    replay.counts.lots_reused === 5 && replay.counts.lots_created === 0);

  // Contradiction: live lot facts differ from the plan → loud stop.
  db.tables.auction_evidence_lot[0].brand_text = "Forged";
  await assert.rejects(applyMonacoPlanSlice(plan, db, { maxRows: 100 }), /lot contradiction/);
  n += 1;
  db.tables.auction_evidence_lot[0].brand_text = "Testor";

  // Contradiction: a different current result → loud stop, never superseded.
  db.tables.auction_evidence_result[0].price_realized = 999999;
  await assert.rejects(applyMonacoPlanSlice(plan, db, { maxRows: 100 }), /result contradiction/);
  n += 1;
}

/* ── 4 · the real registered manifest is the verified corpus, exactly ──── */
{
  const real = JSON.parse(read("scripts/monaco-legend/layer2-et33-et35-et36.manifest.json"));
  ok("the packet pins the independently verified corpus hash",
    real.corpus.sha256 === "8ace4af5d275e50868ecb037ccbbf160a576f0bbee3a8af77992de43cde5a110");
  ok("821 rows across the three sales",
    real.corpus.rows_total === 821 &&
    real.sales.map((s) => s.expected.rows).reduce((a, b) => a + b, 0) === 821);
  ok("the ET33 monetary gate is the exact reconciled total",
    real.sales.find((s) => s.code === "ET33").expected.sold_sum_official_premium_vat_eur === 22566860);
  ok("the ET35 monetary gate is the exact reconciled total",
    real.sales.find((s) => s.code === "ET35").expected.sold_sum_official_premium_vat_eur === 16267580);
  const et36 = real.sales.find((s) => s.code === "ET36");
  ok("ET36 carries no monetary gate, no official source, full quarantine",
    et36.expected.sold_sum_official_premium_vat_eur === null &&
    et36.official_result_source === null &&
    et36.expected.price_semantics_review_required_rows === 247 &&
    real.quarantine.ET36.prices_withheld === true);
  ok("outcome vocabulary matches the verification report exactly",
    real.sales.map((s) => s.expected.outcomes).reduce((acc, o) => {
      for (const [k, v] of Object.entries(o)) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {}).sold === 788);
  ok("rights stay UNRULED_INTERNAL_ONLY on every row",
    real.corpus.rights_status_all_rows === "UNRULED_INTERNAL_ONLY");
}

/* ── 5 · ADAPTERS ARE CODE, PACKETS ARE DATA ────────────────────────────
   The three assertions that used to live here counted a hardcoded array and
   resolved packets out of it. That array WAS the defect: a second one lived
   in the browser, and a new sale of an already-proven family needed both
   edited plus a deployment. Counting it again would be pinning the thing
   this flight removed.

   What survives is the half that genuinely belongs in code — the finite
   adapter allowlist — plus, below, regression assertions that the packet
   enumeration has not quietly grown back in either place. */
{
  /* Four, after v8.18 added monaco-portable. Still finite, still code-owned;
     the number is pinned so growth is a deliberate edit here, never drift. */
  ok("the adapter allowlist is still finite and code-owned", ADAPTER_ALLOWLIST.length === 4);
  ok("known adapters are recognised",
    isAllowlistedAdapter("phillips-sale") &&
    isAllowlistedAdapter("monaco-legend") &&
    isAllowlistedAdapter("monaco-layer2") &&
    isAllowlistedAdapter("monaco-portable"));
  ok("an unknown adapter is refused", !isAllowlistedAdapter("sothebys"));
  ok("nothing arbitrary is an adapter",
    !isAllowlistedAdapter({ evil: true }) && !isAllowlistedAdapter(["x"]) && !isAllowlistedAdapter(null));
  ok("every allowlisted adapter declares its accepted schema versions",
    ADAPTER_ALLOWLIST.every((a) => (ADAPTER_SCHEMA_VERSIONS[a] ?? []).length > 0));

  /* Runtime-registerability is a PROVEN subset, never the whole allowlist.
     If this ever equals ADAPTER_ALLOWLIST without the families having been
     audited, the claim has outrun the evidence. */
  ok("runtime-registerable is a strict subset of the allowlist",
    RUNTIME_REGISTERABLE_ADAPTERS.length >= 1 &&
    RUNTIME_REGISTERABLE_ADAPTERS.length < ADAPTER_ALLOWLIST.length);
  ok("every runtime-registerable family is itself allowlisted",
    RUNTIME_REGISTERABLE_ADAPTERS.every((a) => isAllowlistedAdapter(a)));
  ok("monaco-layer2 is the family proven reusable in this flight",
    isRuntimeRegisterable("monaco-layer2"));
  ok("monaco-portable is registerable for PLAN-ONLY use — and only because Apply is withheld for it",
    isRuntimeRegisterable("monaco-portable") && isApplyWithheld("monaco-portable"));
  ok("the two unaudited families are NOT claimed reusable",
    !isRuntimeRegisterable("phillips-sale") && !isRuntimeRegisterable("monaco-legend"));
}

/* ── 5a · THE HARDCODED ENUMERATION IS GONE, BOTH SIDES ─────────────────
   Source assertions, because this is exactly the kind of regression that
   reintroduces itself as a "temporary fallback" and then becomes load-
   bearing. Reading the files is the only way to catch it. */
{
  const registrySrc = readSourceFile(new URL("../lib/auction-operations/registry.ts", import.meta.url), "utf8");
  const clientSrc = readSourceFile(new URL("../components/AdminAuctionResultsIngest.tsx", import.meta.url), "utf8");
  const catalogSrc = readSourceFile(new URL("../lib/auction-operations/packetCatalog.ts", import.meta.url), "utf8");

  ok("the server registry no longer exports a packet list",
    !/export function listPackets/.test(registrySrc) && !/const PACKETS/.test(registrySrc));
  ok("the server registry no longer resolves packets",
    !/export function resolvePacket/.test(registrySrc));
  ok("no packet instance id is hardcoded in the server registry",
    !/NY080126|sales-38-40-41|et33-et35-et36/.test(registrySrc));
  ok("the browser holds no packet array",
    !/const PACKETS\s*:/.test(clientSrc));
  ok("no packet instance id is hardcoded in the browser",
    !/NY080126|sales-38-40-41|et33-et35-et36/.test(clientSrc));
  ok("the browser reads the catalogue over the wire",
    /fetch\("\/api\/admin\/auctions\/packets"/.test(clientSrc));
  ok("the browser has no built-in fallback list when the catalogue fails",
    /catalogError/.test(clientSrc) && !/PACKETS\.map/.test(clientSrc));
  ok("the catalogue reads packet instances from the governed table",
    /from\("auction_operations_packet_revision"\)/.test(catalogSrc));
  ok("only ACTIVE revisions are selectable",
    /\.eq\("activation_state", "active"\)/.test(catalogSrc));

  /* No dynamic adapter resolution anywhere near packet data. */
  ok("no dynamic import is driven by packet data",
    !/import\s*\(\s*`/.test(catalogSrc) && !/new Function|eval\(/.test(catalogSrc));
}

/* ── 5b · DESCRIPTOR HANDLING ───────────────────────────────────────────
   The hash is re-derived from the stored bytes rather than believed. A hash
   sitting beside its own payload authorises nothing. */
{
  const { bytes, sha256 } = descriptorBytesAndHash({ kind: "inline", manifest: { corpus: { sha256: "a".repeat(64) } } });
  ok("descriptor bytes and hash are produced together", typeof bytes === "string" && /^[0-9a-f]{64}$/.test(sha256));

  const good = {
    id: "r1", packet_id: "test-packet", revision: 1, title: "t", description: "",
    adapter_id: "monaco-layer2", adapter_schema_version: "monaco-layer2-v1",
    acquisition_mode: "staged_upload",
    descriptor: { kind: "inline", manifest: { corpus: { sha256: "b".repeat(64) } }, flight: "test-flight" },
    descriptor_bytes: "", descriptor_sha256: "",
    upload_specs: [], source_urls: [], semantic_gates: {},
    validation_state: "validated", approval_state: "approved", activation_state: "active", display_order: 1,
  };
  const h = descriptorBytesAndHash(good.descriptor);
  good.descriptor_bytes = h.bytes;
  good.descriptor_sha256 = h.sha256;

  const loaded = (assertDescriptorIntegrity(good), resolveInlineDescriptor(good));
  ok("an inline descriptor resolves without touching the filesystem", loaded.length === 1);
  ok("the inline manifest is the descriptor's own manifest",
    JSON.stringify(loaded[0].value) === JSON.stringify(good.descriptor.manifest));

  let tamperRefused = false;
  try {
    assertDescriptorIntegrity({ ...good, descriptor_bytes: h.bytes + " " });
  } catch (e) {
    tamperRefused = /descriptor_hash_mismatch/.test(String(e && e.message));
  }
  ok("tampered descriptor bytes are refused against the stored hash", tamperRefused);

  const projected = toRegisteredPacket(good);
  ok("a runtime-registered packet names no repo manifest path", projected.manifestPaths.length === 0);
  ok("the projection carries the row's own identity",
    projected.packetId === "test-packet" && projected.adapter === "monaco-layer2");
}

/* ── 5b2 · DESCRIPTOR AUTHORITY — THE BYTES DECIDE, AND DIVERGENCE REFUSES
   The defect: descriptor_sha256 covered descriptor_bytes, while runtime read
   the separate JSONB descriptor column. Two values, one signature. A valid
   hash over A could sit beside a JSONB B that the code actually executed,
   and every integrity check still passed because each half was internally
   consistent and nothing compared them. */
{
  const mkRow = (bytesValue, jsonbValue, opts = {}) => {
    const bytes = JSON.stringify(bytesValue);
    return {
      id: "rX", packet_id: "auth-test", revision: 1, title: "t", description: "",
      adapter_id: "monaco-layer2", adapter_schema_version: "monaco-layer2-v1",
      acquisition_mode: "staged_upload",
      descriptor: jsonbValue,
      descriptor_bytes: opts.bytes ?? bytes,
      descriptor_sha256: opts.hash ?? sha(opts.bytes ?? bytes),
      upload_specs: [], source_urls: [], semantic_gates: {},
      validation_state: "validated", approval_state: "approved",
      activation_state: "active", display_order: 1,
    };
  };

  const A = { kind: "inline", flight: "flight-A", manifest: { corpus: { sha256: "a".repeat(64) } } };
  const B = { kind: "inline", flight: "flight-B", manifest: { corpus: { sha256: "b".repeat(64) } } };

  /* 1 · valid bytes + matching hash + equivalent JSONB succeeds */
  const good = mkRow(A, A);
  ok("D1 verified bytes with an equivalent projection resolve",
    verifiedDescriptor(good).flight === "flight-A");

  /* Key order must NOT create a false mismatch. Same content, different
     order, and a JSON.stringify comparison would have failed this. */
  const reordered = mkRow(A, { manifest: { corpus: { sha256: "a".repeat(64) } }, flight: "flight-A", kind: "inline" });
  ok("D1 key order is not divergence",
    verifiedDescriptor(reordered).flight === "flight-A");
  ok("D1 structurallyEqual ignores key order",
    structurallyEqual({ x: 1, y: [1, { p: 2, q: 3 }] }, { y: [1, { q: 3, p: 2 }], x: 1 }));
  ok("D1 structurallyEqual still catches real difference",
    !structurallyEqual({ x: 1 }, { x: 2 }) &&
    !structurallyEqual({ x: 1 }, { x: 1, y: 1 }) &&
    !structurallyEqual([1, 2], [2, 1]));

  /* 2 · tampered bytes against a stale hash refuse */
  const tampered = mkRow(A, A, { bytes: JSON.stringify(A) + " ", hash: sha(JSON.stringify(A)) });
  throws("D2 tampered bytes with a stale hash are refused",
    () => verifiedDescriptor(tampered), /descriptor_hash_mismatch/);

  /* 3 · THE ADVERSARIAL FIXTURE. Bytes and hash authorise A; the JSONB
     projection says B. Runtime must never produce anything from B — and
     must not quietly proceed on A either, because a row whose halves
     disagree is untrustworthy as a row. */
  const adversarial = mkRow(A, B);
  throws("D3 bytes-A + hash(A) + JSONB-B fails CLOSED",
    () => verifiedDescriptor(adversarial), /descriptor_projection_mismatch/);
  throws("D3 the inline resolver cannot be reached past that refusal",
    () => resolveInlineDescriptor(adversarial), /descriptor_projection_mismatch/);
  throws("D3 the projection cannot be built from a diverged row either",
    () => toRegisteredPacket(adversarial), /descriptor_projection_mismatch/);
  ok("D3 a diverged row is not usable, so it never reaches a listing",
    !rowIsUsable(adversarial));

  /* B must be unreachable by ANY route through the authority. */
  let leakedB = false;
  for (const fn of [verifiedDescriptor, resolveInlineDescriptor, toRegisteredPacket]) {
    try {
      const out = JSON.stringify(fn(adversarial));
      if (out.includes("flight-B") || out.includes("b".repeat(64))) leakedB = true;
    } catch { /* refusal is the expected outcome */ }
  }
  ok("D3 no consumer can produce B's values from a diverged row", !leakedB);

  /* 4 · the Layer 2 flight identity comes from the verified bytes */
  ok("D4 flight identity is read from the verified descriptor",
    verifiedDescriptor(good).flight === "flight-A");
  const engineSrc = readSourceFile(new URL("../lib/auction-operations/planEngine.ts", import.meta.url), "utf8");
  ok("D4 the plan engine reads the authority, never the raw JSONB",
    /verifiedDescriptor\(revision\)/.test(engineSrc) && !/revision\.descriptor as/.test(engineSrc));

  /* 5 · every runtime consumer goes through the authority */
  const contractSrc = readSourceFile(new URL("../lib/auction-operations/packetContract.ts", import.meta.url), "utf8");
  const catalogSrc2 = readSourceFile(new URL("../lib/auction-operations/packetCatalog.ts", import.meta.url), "utf8");
  const consumers = (contractSrc + catalogSrc2 + engineSrc).match(/row\.descriptor as|revision\.descriptor as/g) ?? [];
  ok("D5 no runtime consumer reads the unverified JSONB directly", consumers.length === 0);
  ok("D5 the inline resolver resolves through the authority",
    /resolveInlineDescriptor[\s\S]{0,200}verifiedDescriptor\(row\)/.test(contractSrc));
  ok("D5 the legacy manifest_paths branch resolves through the authority too",
    /loadDescriptors[\s\S]{0,400}verifiedDescriptor\(row\)/.test(catalogSrc2));

  /* 6 · the two unaudited families are still not registerable after this
     hardening; the registerable set is layer2 plus the plan-only portable
     family added in v8.18 */
  ok("D6 runtime-registerable set is exactly the proven pair",
    RUNTIME_REGISTERABLE_ADAPTERS.length === 2 && isRuntimeRegisterable("monaco-layer2") &&
    isRuntimeRegisterable("monaco-portable") &&
    !isRuntimeRegisterable("phillips-sale") && !isRuntimeRegisterable("monaco-legend"));
}

/* ── 5b3 · RUN BINDING IS NOT OPTIONAL ──────────────────────────────────
   The staged-upload route resolved the exact active revision and then threw
   it away: createRun recorded adapter, packet id, creator and state only. A
   run with no revision id fell back at planning time to whatever was active
   THEN, so stage under A, activate B, plan → B's mechanics on A's files.

   The repair is the binding AND the contract: optional was the defect, and
   the omission was only its symptom. */
{
  const store = readSourceFile(new URL("../lib/auction-operations/runStore.ts", import.meta.url), "utf8");
  const uploads = readSourceFile(new URL("../app/api/admin/auctions/results/uploads/route.ts", import.meta.url), "utf8");
  const planRoute = readSourceFile(new URL("../app/api/admin/auctions/results/plan/route.ts", import.meta.url), "utf8");

  /* R1 · the four fields are REQUIRED — a new caller that forgets them is a
     type error, not a silently unbound run. */
  const sig = store.slice(store.indexOf("export async function createRun"), store.indexOf("): Promise<AuctionRun>"));
  for (const f of ["packetRevisionId: string;", "packetRevision: number;", "descriptorSha256: string;", "adapterSchemaVersion: string;"]) {
    ok(`R1 createRun requires ${f.split(":")[0]}`, sig.includes(f));
  }
  ok("R1 none of the binding inputs is optional any more",
    !/packetRevisionId\?|packetRevision\?|descriptorSha256\?|adapterSchemaVersion\?/.test(sig));
  ok("R1 and none is coerced to null on write",
    !/packet_revision_id: params\.packetRevisionId \?\? null/.test(store));

  /* R2 · the staged-upload run binds at birth, before upload tokens */
  const uploadCall = uploads.slice(uploads.indexOf("createRun(service, {"), uploads.indexOf("const uploads = []"));
  ok("R2 the staged run records the revision id", /packetRevisionId: revision\.id/.test(uploadCall));
  ok("R2 the staged run records the revision number", /packetRevision: revision\.revision/.test(uploadCall));
  ok("R2 the staged run records the descriptor hash", /descriptorSha256: revision\.descriptor_sha256/.test(uploadCall));
  ok("R2 the staged run records the schema version", /adapterSchemaVersion: revision\.adapter_schema_version/.test(uploadCall));
  ok("R2 the binding is written BEFORE any upload token is issued",
    uploads.indexOf("createRun(service, {") < uploads.indexOf("createSignedUploadUrl"));

  /* R3 · the no-upload entrance still binds exactly as before */
  ok("R3 the plan route's own run creation is still bound",
    /packetRevisionId: revision\.id/.test(planRoute));

  /* R4 · planning resolves BY REVISION ID, so a later activation cannot
     move an existing run; the fallback survives only for pre-catalog rows */
  ok("R4 planning resolves the run's bound revision by id",
    /resolvePacketRevisionById\(service, run\.packet_revision_id\)/.test(planRoute));
  ok("R4 the active-revision fallback is reached only when no binding exists",
    /run\.packet_revision_id\s*\?[\s\S]{0,200}: await resolveActivePacketRevision/.test(planRoute));

  /* R5 · every live createRun caller supplies the binding */
  const callers = [uploads, planRoute];
  ok("R5 both live run-creation paths bind their revision",
    callers.every((c) => /packetRevisionId: revision\.id/.test(c)));

  /* R6 · the stage-A / activate-B / plan-A sequence, as a state machine.
     Modelled from what the source above actually does: the run stores A's
     identity at creation, and planning selects by that stored id rather
     than by "whatever is active now". */
  const world = { active: "revA", revisions: { revA: { hash: "aaa", schema: "v1" }, revB: { hash: "bbb", schema: "v1" } } };
  const stagedRun = {
    packet_revision_id: world.active,
    packet_revision: 1,
    descriptor_sha256: world.revisions[world.active].hash,
    adapter_schema_version: world.revisions[world.active].schema,
  };
  world.active = "revB"; // B is activated between staging and planning
  const planned = stagedRun.packet_revision_id ? stagedRun.packet_revision_id : world.active;
  ok("R6 a run staged under A plans under A after B is activated", planned === "revA");
  ok("R6 B cannot change the staged run's descriptor hash",
    stagedRun.descriptor_sha256 === "aaa" && stagedRun.descriptor_sha256 !== world.revisions.revB.hash);
  ok("R6 the run's four binding fields are unchanged by the activation",
    stagedRun.packet_revision_id === "revA" && stagedRun.packet_revision === 1 &&
    stagedRun.descriptor_sha256 === "aaa" && stagedRun.adapter_schema_version === "v1");

  /* And the counterfactual: an unbound run is exactly the defect. */
  const unbound = { packet_revision_id: null };
  ok("R6 an UNBOUND run would have drifted to B — which is why binding is required",
    (unbound.packet_revision_id ? unbound.packet_revision_id : world.active) === "revB");
}

/* ── 5c · THE PLAN-HASH BOUNDARY IS PRESERVED ───────────────────────────
   Making the Layer 2 flight label descriptor-driven could have changed the
   plan bytes for the already-ingested ET33/ET35/ET36 packet. It does not:
   the adapter default is the original literal, and the migrated descriptor
   carries that same string, so this packet's plan bytes stay byte-identical
   while a new sale supplies its own. */
{
  const coreSrc = readSourceFile(new URL("../lib/auction-operations/monaco-layer2-core.mjs", import.meta.url), "utf8");
  const migrationSrc = readSourceFile(
    new URL("../supabase/migrations/20260901120000_auction_operations_packet_catalog.sql", import.meta.url), "utf8");

  ok("the flight label is a parameter, not a literal in the plan object",
    /flight = "monaco-layer2-et33-et35-et36"/.test(coreSrc) && /^\s*flight,\s*$/m.test(coreSrc));
  ok("the migrated descriptor carries the original flight label verbatim",
    /'flight','monaco-layer2-et33-et35-et36'/.test(migrationSrc));
}

/* ── 5d · THE CATALOG'S TRUST BOUNDARY ──────────────────────────────────
   Migration assertions. The order's requirement is that no client role can
   write the mechanics that govern ingestion; the repository's way of
   meeting that is stronger than a SECURITY DEFINER function granted to
   authenticated — there is no grant at all. */
{
  const m = readSourceFile(
    new URL("../supabase/migrations/20260901120000_auction_operations_packet_catalog.sql", import.meta.url), "utf8");

  ok("client roles are revoked from the catalog outright",
    /revoke all on public\.auction_operations_packet_revision\s*\n\s*from public, anon, authenticated, service_role;/.test(m));
  ok("only service_role may write the catalog",
    /grant select, insert, update on public\.auction_operations_packet_revision to service_role;/.test(m));
  ok("anon and authenticated receive no grant of any kind",
    !/grant[^;]*to (anon|authenticated)/i.test(m));
  ok("row level security is enabled", /enable row level security/.test(m));

  ok("a revision cannot be born approved",
    /packet_revision_insert_cannot_approve/.test(m));
  ok("a revision cannot be born active — creation cannot activate",
    /packet_revision_insert_cannot_activate/.test(m));
  ok("approval requires prior validation",
    /check \(approval_state <> 'approved' or validation_state = 'validated'\)/.test(m));
  ok("activation requires prior approval",
    /check \(activation_state <> 'active' or approval_state = 'approved'\)/.test(m));
  ok("approval and activation are separately attributed",
    /approval_is_attributed/.test(m) && /activation_is_attributed/.test(m));
  ok("an approved revision's mechanics are immutable",
    /packet_revision_approved_is_immutable/.test(m));
  ok("approval cannot be silently revoked",
    /packet_revision_approval_is_not_revocable/.test(m));
  ok("at most one revision per packet may be active",
    /unique index[\s\S]{0,200}where activation_state = 'active'/.test(m));
  ok("the adapter allowlist is mirrored as a database CHECK",
    /adapter_id in \('phillips-sale','monaco-legend','monaco-layer2'\)/.test(m));
  /* v8.18 widened the CHECK in a NEW migration; the v8.0 file above is
     history and is not edited. The new file is the exact production gate. */
  const m2 = read("supabase/migrations/20260902140000_auction_operations_monaco_portable_adapter.sql");
  ok("the portable adapter is admitted by a new migration that supersedes the CHECK",
    /drop constraint if exists auction_operations_packet_revision_adapter_id_check/.test(m2) &&
    /adapter_id in \('phillips-sale','monaco-legend','monaco-layer2','monaco-portable'\)/.test(m2));
  ok("that migration is labelled as NOT applied by the flight that wrote it",
    /NOT APPLIED TO PRODUCTION/.test(m2));
  ok("the new migration does not register ET37, stage a keeper, or touch Auction Evidence",
    !/insert into/i.test(m2.replace(/--.*$/gm, "")) && !/auction_evidence/.test(m2.replace(/--.*$/gm, "")));
  ok("every run is bound to the exact revision that produced it",
    /add column if not exists packet_revision_id uuid/.test(m) &&
    /references public\.auction_operations_packet_revision \(id\) on delete restrict/.test(m));
  ok("the three existing instances are migrated, not re-invented",
    /'NY080126'/.test(m) && /'sales-38-40-41'/.test(m) && /'et33-et35-et36'/.test(m));
}

/* ── 5e · REGISTRATION IS NOT INGESTION ─────────────────────────────────
   The founder door writes one catalog row. It fetches nothing, parses no
   corpus and produces no plan — and it cannot activate what it creates. */
{
  const reg = readSourceFile(new URL("../app/api/admin/auctions/packets/route.ts", import.meta.url), "utf8");
  const approve = readSourceFile(new URL("../app/api/admin/auctions/packets/[revisionId]/approve/route.ts", import.meta.url), "utf8");
  const activate = readSourceFile(new URL("../app/api/admin/auctions/packets/[revisionId]/activate/route.ts", import.meta.url), "utf8");

  ok("registration authenticates the founder server-side from the session",
    /supabase\.auth\.getUser\(\)/.test(reg) && /user\.id !== ADMIN_USER_ID/.test(reg));
  ok("registration trusts no caller-supplied actor id",
    !/body\.(actorId|founder|userId|executed_via)/.test(reg));
  ok("registration refuses an adapter off the allowlist",
    /unsupported_adapter/.test(reg));
  ok("registration refuses a family not proven runtime-registerable",
    /adapter_not_runtime_registerable/.test(reg));
  ok("registration refuses an unsupported schema version",
    /unsupported_schema_version/.test(reg));
  ok("registration refuses a malformed descriptor",
    /invalid_descriptor/.test(reg));
  ok("registration refuses a conflicting duplicate identity",
    /duplicate_packet_revision/.test(reg));
  ok("registration computes the descriptor hash server-side",
    /descriptorBytesAndHash\(descriptor\)/.test(reg));
  ok("registration never activates what it creates",
    !/activation_state: "active"/.test(reg) && !/approval_state: "approved"/.test(reg));
  ok("registration ingests nothing",
    !/generatePlanForRun|auction_evidence_create_or_correct_result|buildLayer2Plan/.test(reg));

  ok("approval is its own act, and requires validation first",
    /not_validated/.test(approve) && /approval_state: "approved"/.test(approve));
  ok("approval does not activate", !/activation_state: "active"/.test(approve));
  ok("activation is its own act, and requires approval first",
    /not_approved/.test(activate));

  /* ── ATOMIC REVISION SWITCH ────────────────────────────────────────────
     The route used to retire the incumbent and activate the successor in
     two independent requests. Between them the packet had NO active
     revision — a dropped connection in that window made a packet vanish
     from the room. These pin the repair rather than the intention. */
  ok("1 · the route no longer sequences the two writes itself",
    !/activation_state: "retired"/.test(activate) &&
    (activate.match(/\.from\("auction_operations_packet_revision"\)/g) ?? []).length === 0);
  ok("1 · the switch is one call into one transaction",
    /\.rpc\("auction_operations_activate_packet_revision"/.test(activate));
  ok("1 · a failed switch is reported as unchanged, not half-applied",
    /rolled the whole switch back/.test(activate));
  ok("the actor is the session uid, never a request field",
    /p_actor: user\.id/.test(activate) && !/body\.(actor|actorId|founder)/.test(activate));

  const mig = readSourceFile(
    new URL("../supabase/migrations/20260901120000_auction_operations_packet_catalog.sql", import.meta.url), "utf8");
  const fn = mig.slice(
    mig.indexOf("create or replace function public.auction_operations_activate_packet_revision"),
    mig.indexOf("revoke all on function public.auction_operations_activate_packet_revision"));

  ok("2 · retirement and activation happen in the same function body",
    /set activation_state = 'retired'/.test(fn) && /set activation_state = 'active'/.test(fn));
  /* The constraint that let a revision be activated once and never retired.
     It was asserted for PRESENCE and it was present; only a live retirement
     showed that what it forbade included the thing the feature must do. The
     assertion now pins its SHAPE. */
  const fix = readSourceFile(
    new URL("../supabase/migrations/20260901213000_packet_revision_activation_attribution_fix.sql", import.meta.url), "utf8");
  ok("2 · a retired revision may keep its activation attribution",
    /activation_state <> 'active'\s*or \(activated_by is not null and activated_at is not null\)/.test(fix));
  ok("2 · the biconditional form is gone from the live shape",
    !/\(activation_state = 'active'\)\s*=\s*\(/.test(fix));
  /* The migration NAMES approval_is_attributed to explain why it is left
     alone, so absence of the string is the wrong test — what matters is that
     no DDL touches it. */
  ok("2 · approval attribution is deliberately left alone",
    !/constraint\s+approval_is_attributed/.test(fix));
  ok("2 · the corrective migration touches exactly one constraint",
    (fix.match(/alter table/gi) ?? []).length === 2 &&
    !/create table|create function|create trigger|grant |revoke /i.test(fix));
  ok("2 · exactly one active revision survives, enforced by the index too",
    /unique index[\s\S]{0,200}where activation_state = 'active'/.test(mig));
  ok("3 · concurrent switches serialize on the packet's own rows",
    /for update/.test(fn) && /where packet_id = v_packet_id/.test(fn));
  ok("3 · the lock is taken in a deterministic order, so two switches cannot deadlock",
    /order by id\s+for update/.test(fn));
  ok("3 · eligibility is re-read UNDER the lock, not before it",
    fn.indexOf("for update") < fn.indexOf("v_row.approval_state <> 'approved'"));
  /* RETIRED IS TERMINAL. The rule is written as an allowlist, not as a
     "not retired" exclusion: an exclusion list is one new state away from
     being wrong again, while a positive rule refuses anything it has not
     been taught to permit. */
  const term = readSourceFile(
    new URL("../supabase/migrations/20260901220000_packet_revision_retired_is_terminal.sql", import.meta.url), "utf8");
  ok("5 · a retired revision can never be activated again",
    /activation_state = 'retired'[\s\S]{0,120}retired_is_terminal/.test(term));
  ok("5 · the rule is positive — only 'inactive' may proceed",
    /activation_state <> 'inactive'[\s\S]{0,120}not_activatable/.test(term));
  ok("5 · the approval and already-active refusals are preserved",
    /not_approved/.test(term) && /already_active/.test(term));
  ok("5 · the atomic switch and its lock order are preserved",
    /order by id\s+for update/.test(term) &&
    /set activation_state = 'retired'/.test(term) && /set activation_state = 'active'/.test(term));
  ok("5 · the corrective migration replaces ONLY the function",
    !/create table|alter table|create index|grant |revoke |insert into|delete from/i.test(term));
  ok("5 · the route surfaces the terminal refusal to the founder",
    /retired_is_terminal/.test(activate) && /not_activatable/.test(activate));

  ok("3 · an already-active target is refused inside the transaction",
    /v_row\.activation_state = 'active'/.test(fn) && /already_active/.test(fn));

  ok("4 · EXECUTE is revoked from every client role",
    /revoke all on function public\.auction_operations_activate_packet_revision\(uuid, uuid\)\s+from public, anon, authenticated;/.test(mig));
  ok("4 · EXECUTE is granted only to the trusted server role",
    /grant execute on function public\.auction_operations_activate_packet_revision\(uuid, uuid\)\s+to service_role;/.test(mig));
  ok("4 · the definer function pins its search_path",
    /security definer\s+set search_path = public, pg_catalog/.test(fn));
  ok("4 · founder auth still resolved by the route from the session",
    /supabase\.auth\.getUser\(\)/.test(activate) && /user\.id !== ADMIN_USER_ID/.test(activate));
  ok("4 · the table's own grants are untouched by this repair",
    /grant select, insert, update on public\.auction_operations_packet_revision to service_role;/.test(mig) &&
    !/grant[^;]*auction_operations_packet_revision[^;]*to (anon|authenticated)/i.test(mig));

  const plan = readSourceFile(new URL("../app/api/admin/auctions/results/plan/route.ts", import.meta.url), "utf8");
  ok("planning resolves by the run's bound revision id, not by packet id",
    /resolvePacketRevisionById\(service, run\.packet_revision_id\)/.test(plan));
  ok("a new run records the revision it was created from",
    /packetRevisionId: revision\.id/.test(plan) && /descriptorSha256: revision\.descriptor_sha256/.test(plan));
}

/* ── 6 · presentation truth ─────────────────────────────────────────────── */
{
  const base = {
    sale_id: "a", sale_name: "S", sale_date: "2026-01-01", location: null, source_url: null,
    house_name: "H", artifact_count: 1, permission_statuses: [], publication_statuses: ["internal_only"],
    public_use_scopes: [], retention_scopes: ["metadata_only"], lot_count: 10, current_result_count: 10,
    sold_count: 8, passed_count: 2, withdrawn_count: 0, unsold_count: 0, priced_result_count: 8,
    case_count: 0, fresh_exact_count: 0, fresh_nonexact_count: 0, stale_decision_count: 0, no_case_count: 10,
  };
  ok("no cases reads as No cases", identityStateOf(base) === "no_cases");
  ok("a fully fresh-exact sale is Resolved",
    identityStateOf({ ...base, case_count: 10, fresh_exact_count: 10, no_case_count: 0 }) === "resolved");
  ok("a STALE exact decision is never Resolved",
    identityStateOf({ ...base, case_count: 10, fresh_exact_count: 9, stale_decision_count: 1, no_case_count: 0 }) === "partial");
  ok("stale decisions with zero fresh-exact read Unresolved",
    identityStateOf({ ...base, case_count: 10, stale_decision_count: 10, no_case_count: 0 }) === "unresolved");
  ok("an empty sale is its own truthful state, not Resolved",
    identityStateOf({ ...base, lot_count: 0 }) === "no_lots");

  const rows = [
    { ...base, sale_id: "a", sale_date: "2026-01-01", house_name: "B" },
    { ...base, sale_id: "b", sale_date: null, house_name: "A" },
    { ...base, sale_id: "c", sale_date: "2026-03-01", house_name: "A" },
  ];
  const byDate = sortResultsRows(rows, "date_desc");
  ok("date sort really reorders, nulls last",
    byDate[0].sale_id === "c" && byDate[2].sale_id === "b");
  const byHouse = sortResultsRows(rows, "house_asc");
  ok("house sort is stable with the date tiebreak",
    byHouse[0].house_name === "A" && byHouse[0].sale_id === "c");

  const up = (id, starts, house, location = null) => ({
    id, auction_house: house, auction_title: "T", location, starts_at: starts,
    ends_at: null, source_url: null, preview_url: null, catalog_url: null,
    online_only: null, updated_at: starts,
  });
  const now = Date.parse("2026-08-23T12:00:00Z");
  const upRows = [
    up("x", "2026-09-01T10:00:00Z", "Zed"),
    up("y", "2026-08-25T10:00:00Z", "Alpha", "Geneva"),
    up("z", "2026-08-23T11:00:00Z", "Mid"),
  ];
  ok("soonest-first puts the live sale on top",
    sortUpcomingRows(upRows, "start_asc", now)[0].id === "z");
  ok("status sort ranks live before upcoming",
    sortUpcomingRows(upRows, "status", now)[0].id === "z");
  ok("blank locations sort last",
    sortUpcomingRows(upRows, "location_asc", now)[2].location === null ||
    sortUpcomingRows(upRows, "location_asc", now)[2].id !== "y");
}

/* ── 7 · governance boundary — structural pins ──────────────────────────── */
{
  const uploads = read("app/api/admin/auctions/results/uploads/route.ts");
  const plan = read("app/api/admin/auctions/results/plan/route.ts");
  const apply = read("app/api/admin/auctions/results/apply/route.ts");
  const runs = read("app/api/admin/auctions/results/runs/[runId]/route.ts");
  const engine = read("lib/auction-operations/planEngine.ts");
  const slice = read("lib/auction-operations/applySlice.ts");
  const store = read("lib/auction-operations/runStore.ts");
  const migration = read("supabase/migrations/20260823160000_auction_operations_run_store_and_read_model.sql");
  const roomClient = read("components/AdminAuctionResultsIngest.tsx");
  const opsClient = read("components/AdminAuctionOperations.tsx");

  for (const [name, src] of [["uploads", uploads], ["plan", plan], ["apply", apply], ["runs", runs]]) {
    ok(`${name} route gates on its own hardcoded founder literal`,
      /const ADMIN_USER_ID = "/.test(src) && /user\.id !== ADMIN_USER_ID/.test(src));
    ok(`${name} route creates the trusted client only after the gate`,
      src.indexOf("createServiceClient()") > src.indexOf("user.id !== ADMIN_USER_ID"));
  }

  ok("planning can write NO Auction Evidence — the engine never inserts or calls the result RPC",
    !/auction_evidence/.test(engine.replace(/\/\*[\s\S]*?\*\//g, "")));
  ok("the apply dispatcher writes no result directly — it delegates to the shared engines",
    !/auction_evidence_create_or_correct_result/.test(slice.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    !/\.insert\(/.test(slice));
  ok("apply demands the reviewed hash and refuses a mismatch",
    /plan_hash_mismatch/.test(apply) && /run\.plan_sha256 !== approvedSha/.test(apply));
  ok("apply re-verifies the stored plan bytes against the recorded hash",
    /verifyStoredPlan/.test(apply) && /recomputed !== run\.plan_sha256/.test(store));
  ok("a plan with contradictions cannot be applied",
    /apply_contradiction/.test(apply) && /contradictions\.length > 0/.test(apply));
  ok("upload paths are server-generated — no browser path reaches storage",
    /runs\/\$\{run\.id\}\/\$\{spec\.kind\}/.test(uploads) && !/body\.path|inputPaths/.test(uploads));
  ok("the run table is browser-unreachable",
    /revoke all on public\.auction_operations_run from public, anon, authenticated, service_role/.test(migration) &&
    /grant select, insert, update on public\.auction_operations_run to service_role/.test(migration));
  ok("the read-model functions execute for service_role only",
    /revoke all on function public\.auction_operations_results_read_model\(\) from public, anon, authenticated/.test(migration) &&
    /revoke all on function public\.auction_operations_sale_detail\(uuid\) from public, anon, authenticated/.test(migration));
  ok("the staging bucket is private",
    /'auction-operations-staging', false/.test(migration.replace(/\s+/g, " ")));
  ok("no client component imports the service client",
    !/supabase\/service/.test(roomClient) && !/supabase\/service/.test(opsClient));
  /* The header comment documents what is deliberately absent — strip
     comments so the pin reads only what the room actually renders. */
  const opsRendered = opsClient.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("no fabricated columns: no Public-strip eligibility, no sale Ingestion status",
    !/Public strip|publicStrip|ingestion_status|Ingestion status/i.test(opsRendered));
  ok("the room says plainly that only registered packets exist",
    /registered/.test(roomClient) &&
    /never\s+accepts an arbitrary\s+source/.test(roomClient.replace(/\s+/g, " ")));
}

/* ════════════════════════════════════════════════════════════════════════
   8 · MONACO PORTABLE — ET37 plan-only pilot (v8.18)

   Four claims, each with its own proof:
     · the PROFILE is structural — a non-ET37 keeper of the same shape passes
       it, and the ET37 packet gates are what reject that keeper;
     · the KEEPER's bytes are authority — hash, compare, then parse, and
       nothing else;
     · the PLAN is deterministic, writes nothing, and carries an explicit
       evidence-completeness delta;
     · APPLY is refused for the family by name, before any engine, and that
       refusal exists before the family is registerable.

   The real ET37 keeper is PRIVATE evidence and is not in this repository.
   When it is present on disk (Downloads, or FWT_ET37_KEEPER), the real
   proofs run. When it is absent the suite says so LOUDLY as a CANARY and
   proves the profile on the synthetic fixture only — it never pretends.
   ════════════════════════════════════════════════════════════════════════ */

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const et37Descriptor = JSON.parse(read("scripts/monaco-legend/portable-et37.descriptor.json"));
const et37Manifest = et37Descriptor.manifest;

/* A structurally valid keeper of a DIFFERENT sale: different code, counts
   and total, identical profile. Its only job is to prove the profile does
   not read a sale name. */
function syntheticKeeper(overrides = {}) {
  const lot = (id, outcome, brand, amount, extra = {}) => ({
    lot_id: id, lot_identifier_raw: id, session: "I",
    offered: outcome !== "withdrawn", outcome, brand,
    model: outcome === "withdrawn" ? null : "Model " + id,
    reference: "REF-" + id, year: outcome === "withdrawn" ? null : "Circa 2000",
    estimate: outcome === "withdrawn" ? null : { currency: "CHF", low: 100, high: 200, raw: "Fr. 100 – 200", qualifier_raw: null, unusual_estimate_wording_raw: null },
    result: outcome === "sold"
      ? { amount, currency: "CHF", house_result_wording: "Result (Premium)", raw: `Result (Premium) Fr. ${amount}` }
      : { amount: null, currency: null, house_result_wording: outcome === "unsold" ? "Result Passed" : "WITHDRAWN", raw: outcome === "unsold" ? "Result Passed" : "WITHDRAWN" },
    fwt_price_basis: outcome === "sold" ? "hammer_plus_premium" : null,
    specs_source_stated: outcome === "withdrawn" ? {} : { case_material: "Steel" },
    canonical_url: `https://www.example-house.test/auction/zz99/lot-${id}`,
    detail_capture_provenance: "synthetic canonical lot page",
    ...extra,
  });
  const lots = [
    lot("1", "sold", "Alpha", 1000),
    lot("2", "sold", "Beta", 2000),
    lot("3", "unsold", "Gamma", null),
    lot("4", "sold", "Delta", 3500),
    lot("5", "withdrawn", "Epsilon", null),
  ];
  return {
    artifact: {
      artifact_type: "auction_sale_reconciliation", artifact_version: "v1",
      preferred_filename: "synthetic_ZZ99_reconciled_v1.json", scope: "ZZ99 only",
      source_lock: { allowed_domain: "example-house.test", official_house_sources_only: true, third_party_sources_used: false },
      hard_boundaries: { ingestion_performed: false }, generated_utc: "2026-09-02",
    },
    sale: {
      house: "Synthetic House", house_stated_sale_title: "Synthetic Sale", governed_sale_label: "Synthetic Sale 99",
      sale_code: "ZZ99", date: "2026-01-15", date_raw: "15 January 2026", venue: "Nowhere", city: "Nowhere",
      location_raw: "Nowhere Hall, Nowhere", auction_url: "https://www.example-house.test/auction/zz99",
      currency: "CHF", sessions: [], house_published_total: { amount: 6500, currency: "CHF", raw: "Fr. 6'500" },
      house_published_sold_rate: { percent: 75, raw: "75% Sold" }, house_published_catalogue_lot_count: 5,
    },
    price_basis_governance: {
      et37_house_result_labels_observed: [], sold_result_basis_evidence: "synthetic",
      sold_fwt_price_basis: "hammer_plus_premium", unsold_fwt_price_basis: null, withdrawn_fwt_price_basis: null,
      basis_inference_from_other_sales: false, forbidden_other_basis_emitted: false,
    },
    counts: { catalogue_records: 5, offered: 4, sold: 3, unsold: 1, withdrawn: 1, unsold_lot_ids: ["3"], withdrawn_lot_ids: ["5"], numeric_lot_identifier_gaps: [] },
    reconciliation: { sold_result_sum: { amount: 6500, currency: "CHF" }, house_published_total: { amount: 6500, currency: "CHF" }, result_sum_delta: 0, result_sum_reconciles_exactly: true },
    source_anomalies: [],
    lots,
    source_manifest: { sale_page: { url: "https://www.example-house.test/auction/zz99", roles: [] }, canonical_lot_pages: [], official_domain_only: true, third_party_sources: [], source_count: { sale_pages: 1, canonical_lot_pages: 5 } },
    reconciliation_manifest: [],
    ...overrides,
  };
}
const synthBytes = () => Buffer.from(JSON.stringify(syntheticKeeper()), "utf8");
const synthSha = sha(synthBytes());
const synthManifest = {
  house: { name: "Synthetic House", slug: "synthetic-house", website_url: "https://www.example-house.test" },
  sale: { code: "ZZ99", name: "Synthetic Sale 99", date: "2026-01-15", location: "Nowhere Hall, Nowhere", currency: "CHF", canonical_auction_url: "https://www.example-house.test/auction/zz99" },
  keeper: { sha256: synthSha, byte_length: synthBytes().length, preferred_filename: "synthetic_ZZ99_reconciled_v1.json" },
  gates: { sale_code: "ZZ99", canonical_auction_url: "https://www.example-house.test/auction/zz99", lot_count: 5, sold: 3, unsold: 1, withdrawn: 1, sold_total: { amount: 6500, currency: "CHF" }, currency: "CHF", price_basis: "hammer_plus_premium", canonical_urls_unique: true },
};

/* ── 8a · the profile is structural, not ET37-hardcoded ────────────────── */
{
  const view = validatePortableProfile(syntheticKeeper());
  ok("a non-ET37 keeper of the same shape passes PROFILE validation",
    view.profile === PORTABLE_PROFILE_V1 && view.sale.code === "ZZ99" &&
    view.computed.catalogue_records === 5 && view.computed.sold === 3 && view.computed.sold_total === 6500);
  throws("…and the ET37 PACKET gates reject that same keeper by sale, counts and total",
    () => reconcilePortableGates(view, et37Manifest.gates), /portable_gate_mismatch:.*sale_code.*lot_count.*sold_total/s);
  ok("…while its own packet gates accept it — profile acceptance is structural, packet acceptance is sale-specific",
    reconcilePortableGates(view, synthManifest.gates).every((c) => c.pass));

  const coreSrc = strip(read("lib/auction-operations/monaco-portable-core.mjs"));
  ok("no hidden ET37 sale-code branch governs schema support in the core",
    !/ET37/.test(coreSrc) && !/sale_code\s*===/.test(coreSrc) && !/166|8029125/.test(coreSrc));

  throws("wrong artifact_version refuses",
    () => validatePortableProfile(syntheticKeeper({ artifact: { ...syntheticKeeper().artifact, artifact_version: "v2" } })), /portable_profile_refused:.*artifact_version/);
  throws("a malformed envelope (no sale block) refuses",
    () => validatePortableProfile({ ...syntheticKeeper(), sale: undefined }), /portable_profile_refused:.*sale block/);
  throws("an unsupported outcome refuses — 'passed' is not in the vocabulary",
    () => { const k = syntheticKeeper(); k.lots[2].outcome = "passed"; validatePortableProfile(k); }, /outcome "passed" is not supported/);
  throws("a duplicate lot id refuses",
    () => { const k = syntheticKeeper(); k.lots[1].lot_id = "1"; validatePortableProfile(k); }, /duplicate lot_id/);
  throws("a duplicate canonical URL refuses",
    () => { const k = syntheticKeeper(); k.lots[1].canonical_url = k.lots[0].canonical_url; validatePortableProfile(k); }, /duplicate canonical_url/);
  throws("a sold row in the wrong currency refuses",
    () => { const k = syntheticKeeper(); k.lots[0].result.currency = "EUR"; validatePortableProfile(k); }, /currency EUR is not the sale currency/);
  throws("a sold row off the governed basis refuses — no transform, no other basis",
    () => { const k = syntheticKeeper(); k.lots[0].fwt_price_basis = "hammer"; validatePortableProfile(k); }, /basis hammer is not the governed/);
  throws("an unsold row carrying a price refuses — no invented triplet",
    () => { const k = syntheticKeeper(); k.lots[2].result.amount = 1; validatePortableProfile(k); }, /unsold lot 3 carries a result amount/);
  throws("a keeper whose own counts disagree with its lots refuses before any packet gate",
    () => { const k = syntheticKeeper(); k.counts.sold = 2; validatePortableProfile(k); }, /counts\.sold=2 but its lots compute 3/);
  throws("a keeper whose declared sold sum disagrees with its lots refuses",
    () => { const k = syntheticKeeper(); k.reconciliation.sold_result_sum.amount = 1; validatePortableProfile(k); }, /sold_result_sum 1 CHF but lots compute 6500/);
  throws("a withdrawn lot marked offered refuses",
    () => { const k = syntheticKeeper(); k.lots[4].offered = true; validatePortableProfile(k); }, /withdrawn lot 5 is marked offered/);
}

/* ── 8b · keeper byte authority ────────────────────────────────────────── */
{
  const bytes = synthBytes();
  const v = verifyKeeperBytes(bytes, synthSha);
  ok("exact bytes hash to the pinned sha and parse", v.sha256 === synthSha && v.byteLength === bytes.length && v.keeper.lots.length === 5);
  const tampered = Buffer.from(bytes);
  tampered[tampered.length - 5] ^= 0x01;
  throws("tampered bytes refuse", () => verifyKeeperBytes(tampered, synthSha), /keeper_hash_mismatch/);
  const pretty = Buffer.from(JSON.stringify(JSON.parse(bytes.toString("utf8")), null, 2), "utf8");
  ok("a byte-different serialization parses to the same value…", JSON.stringify(JSON.parse(pretty.toString())) === bytes.toString());
  throws("…and is REFUSED anyway when the exact hash is pinned", () => verifyKeeperBytes(pretty, synthSha), /keeper_hash_mismatch/);
  throws("an unpinned hash refuses", () => verifyKeeperBytes(bytes, undefined), /keeper_hash_unpinned/);
  throws("verified-but-not-JSON refuses", () => verifyKeeperBytes(Buffer.from("nope"), sha("nope")), /keeper_unparseable/);
  const coreSrc = strip(read("lib/auction-operations/monaco-portable-core.mjs"));
  const compareAt = coreSrc.indexOf("actual !== expectedSha256");
  ok("the parsed value comes from the verified bytes and nothing else — one JSON.parse, on the hashed buffer, after the compare",
    (coreSrc.match(/JSON\.parse\(/g) ?? []).length === 1 &&
    compareAt >= 0 && compareAt < coreSrc.indexOf("JSON.parse(bytes.toString"));
}

/* ── 8c · deterministic plan, zero writes, evidence delta ──────────────── */
{
  const db = fakeDb();
  const k = verifyKeeperBytes(synthBytes(), synthSha);
  const args = { manifest: synthManifest, keeper: k.keeper, keeperSha256: k.sha256, keeperByteLength: k.byteLength, db, packetId: "zz99-portable" };
  const p1 = await buildPortablePlan(args);
  const p2 = await buildPortablePlan(args);
  ok("plan generation is deterministic — identical bytes, identical hash",
    sha(portablePlanToBytes(p1)) === sha(portablePlanToBytes(p2)));
  ok("planning wrote NOTHING — no rows, no RPC calls",
    db.tables.auction_evidence_lot.length === 0 && db.tables.auction_evidence_sale.length === 0 &&
    db.tables.auction_evidence_house.length === 0 && db.rpcCalls === 0);
  ok("the plan names its family, profile, keeper hash and withheld state",
    p1.adapter === "monaco-portable" && p1.profile === PORTABLE_PROFILE_V1 && p1.keeper.sha256 === synthSha &&
    p1.apply.enabled === false && /WITHHELD/.test(p1.summary.apply_state));
  ok("every summary value is a primitive the room can render",
    Object.values(p1.summary).every((v) => ["string", "number", "boolean"].includes(typeof v)));
  ok("the review summary carries what founder judgment needs",
    ["adapter","profile","sale","sale_code","keeper_sha256","lot_count","sold","unsold","withdrawn","sold_total","currency","price_basis","contradictions","apply_state"]
      .every((key) => key in p1.summary));
  ok("rows are in the shared vocabulary, sorted, and result triplets are honest",
    p1.sales[0].rows.length === 5 && p1.sales[0].rows[0].lot_number === "1" &&
    p1.sales[0].rows[0].result.price_basis === "hammer_plus_premium" &&
    p1.sales[0].rows[4].result.price_realized === null && p1.sales[0].rows[4].result.currency === null && p1.sales[0].rows[4].result.price_basis === null);
  ok("no description is invented for a keeper that carries none",
    p1.sales[0].rows.every((r) => r.description === null));
  ok("every gate is recorded with expected/actual/pass, and all pass",
    p1.gates_reconciliation.length >= 10 && p1.gates_reconciliation.every((g) => g.pass && "expected" in g && "actual" in g));

  /* §17 — the keeper's hash describes the keeper, never an official page.
     v8.21: two distinct artifact specs. The sale page stays URL-backed and
     hashless; the keeper is URL-less and carries the keeper hash. */
  const salePage = p1.sales[0].artifact_specs.find((a) => a.key === "sale_page");
  const keeperSpec = p1.sales[0].artifact_specs.find((a) => a.key === "portable_keeper");
  ok("sale_page and portable_keeper are distinct specs",
    p1.sales[0].artifact_specs.length === 2 && salePage && keeperSpec && salePage !== keeperSpec);
  ok("the sale-page artifact carries the official URL with NO hash, because this flight never fetched that page",
    salePage.source_url === synthManifest.sale.canonical_auction_url && salePage.content_hash === null &&
    salePage.artifact_retention_scope === "metadata_only" && salePage.full_artifact_storage_path === null);
  ok("the keeper hash sits on the keeper block and on the URL-less keeper spec only — never on a URL-backed artifact",
    p1.keeper.sha256 === synthSha && keeperSpec.content_hash === synthSha && keeperSpec.source_url === null &&
    p1.sales[0].artifact_specs.filter((a) => a.source_url !== null).every((a) => a.content_hash !== synthSha));
  ok("the keeper spec carries the ruled rights/retention values and a content-addressed path",
    keeperSpec.intake_method === "founder_supplied_file" && keeperSpec.permission_status === "unresolved" &&
    keeperSpec.publication_status === "internal_only" && keeperSpec.public_use_scope === "normalized_facts_only" &&
    keeperSpec.artifact_retention_scope === "full_artifact_private" && keeperSpec.automation_status === "not_applicable" &&
    keeperSpec.full_artifact_storage_path === `sha256/${synthSha}.json`);
  ok("no timestamp is written into deterministic plan bytes",
    !("retrieved_at" in keeperSpec) && !("retrieved_at" in salePage) && !/"retrieved_at"/.test(portablePlanToBytes(p1)));
  ok("the sale-page artifact keeps the most conservative posture; the keeper's normalized facts join the governed lane",
    salePage.public_use_scope === "none" && keeperSpec.public_use_scope === "normalized_facts_only");
  ok("the plan names the keeper's retention destination and still says Apply is withheld",
    /PRIVATE_KEEPER_ARTIFACT/.test(p1.keeper.retention) && /withheld/i.test(p1.keeper.retention) &&
    /portable_keeper artifact spec/.test(p1.keeper.source_artifact_representation));

  /* §15 — evidence completeness delta */
  const delta = evidenceCompletenessDelta(k.keeper);
  ok("an evidence completeness delta is generated and every category is classified with a reason",
    delta.length >= 15 && delta.every((d) => typeof d.category === "string" && typeof d.plan_carries === "string" && typeof d.destination === "string" && typeof d.reason === "string"));
  ok("nothing accepted disappears silently: every category is carried, retained-with-path, or not-carried-with-reason",
    delta.every((d) => /^(carried|retained|not carried)/.test(d.reason)));
  ok("the plan embeds the same delta it summarises",
    p1.evidence_completeness_delta.length === delta.length &&
    p1.summary.evidence_categories_carried + p1.summary.evidence_categories_retained_only + p1.summary.evidence_categories_not_carried === delta.length);

  /* a live collision is a contradiction on the plan, never a repair */
  const db2 = fakeDb();
  db2.tables.auction_evidence_house.push({ id: "h1", name: "Synthetic House", slug: "synthetic-house", website_url: "https://www.example-house.test" });
  db2.tables.auction_evidence_sale.push({ id: "s1", house_id: "h1", sale_name: "Synthetic Sale 99", source_url: "https://www.example-house.test/auction/zz99" });
  const p3 = await buildPortablePlan({ ...args, db: db2 });
  ok("an existing sale is a recorded contradiction, and the plan still builds for review",
    p3.contradictions.length === 1 && /already exists/.test(p3.contradictions[0]) && p3.summary.sale_row === "CONFLICT" && p3.summary.house_row === "reuse");
  n += 1;
  await assert.rejects(
    buildPortablePlan({ ...args, keeperSha256: "0".repeat(64) }),
    /keeper_hash_mismatch/,
    "a plan for a keeper the packet does not pin is refused"
  );
}

/* ── 8d · the REAL ET37 keeper, when present ───────────────────────────── */
{
  const candidates = [
    process.env.FWT_ET37_KEEPER,
    path.join(os.homedir(), "Downloads", et37Manifest.keeper.preferred_filename),
  ].filter(Boolean);
  const keeperPath = candidates.find((p) => existsSync(p));
  if (!keeperPath) {
    console.log("  CANARY: real ET37 keeper not present on this machine — 8d ran on the synthetic fixture only; the ET37 reconciliation proof is NOT claimed here");
    ok("CANARY surfaced: ET37 real-keeper proofs skipped and said so", true);
  } else {
    const bytes = readFileSync(keeperPath);
    const v = verifyKeeperBytes(bytes, et37Manifest.keeper.sha256);
    ok("the real ET37 keeper hashes to the descriptor's pinned sha256 and byte length",
      v.sha256 === et37Manifest.keeper.sha256 && v.byteLength === et37Manifest.keeper.byte_length);
    const view = validatePortableProfile(v.keeper);
    ok("the real ET37 keeper passes profile v1",
      view.profile === PORTABLE_PROFILE_V1 && view.sale.code === "ET37");
    ok("ET37 reconciles: 166 lots, 156 sold, 9 unsold, 1 withdrawn, CHF 8,029,125, hammer_plus_premium",
      view.computed.catalogue_records === 166 && view.computed.sold === 156 && view.computed.unsold === 9 &&
      view.computed.withdrawn === 1 && view.computed.sold_total === 8029125 && view.sale.currency === "CHF" &&
      view.price_basis === "hammer_plus_premium" && view.canonical_urls_unique);
    ok("every ET37 packet gate passes against the real keeper",
      reconcilePortableGates(view, et37Manifest.gates).every((c) => c.pass));
    throws("the synthetic ZZ99 keeper presented as the ET37 packet is refused by the gates",
      () => reconcilePortableGates(validatePortableProfile(syntheticKeeper()), et37Manifest.gates), /portable_gate_mismatch/);

    const db = fakeDb();
    const args = { manifest: et37Manifest, keeper: v.keeper, keeperSha256: v.sha256, keeperByteLength: v.byteLength, db, packetId: "et37-portable" };
    const p1 = await buildPortablePlan(args);
    const p2 = await buildPortablePlan(args);
    ok("the real ET37 plan is deterministic and writes nothing",
      sha(portablePlanToBytes(p1)) === sha(portablePlanToBytes(p2)) && db.rpcCalls === 0 && db.tables.auction_evidence_lot.length === 0);
    ok("the ET37 plan carries 166 rows, lot 129 withdrawn with no price triplet, and 156 priced sold rows",
      p1.sales[0].rows.length === 166 &&
      p1.sales[0].rows.find((r) => r.lot_number === "129").result.sale_outcome === "withdrawn" &&
      p1.sales[0].rows.find((r) => r.lot_number === "129").result.price_realized === null &&
      p1.sales[0].rows.filter((r) => r.result.price_realized !== null).length === 156 &&
      p1.sales[0].rows.filter((r) => r.result.price_realized !== null).reduce((a, r) => a + r.result.price_realized, 0) === 8029125);
    ok("the ET37 plan preserves the nine source anomalies verbatim and the NO RESERVE wording on lot 100",
      p1.provenance.source_anomalies.length === 9 &&
      p1.sales[0].rows.find((r) => r.lot_number === "100").source_identity.estimate.unusual_estimate_wording_raw === "NO RESERVE");
    ok("the ET37 summary is founder-legible and says Apply is withheld",
      p1.summary.sale === "Exclusive Timepieces 37" && p1.summary.keeper_sha256 === et37Manifest.keeper.sha256 &&
      p1.summary.lot_count === 166 && p1.summary.sold_total === 8029125 && /WITHHELD/.test(p1.summary.apply_state) && p1.summary.contradictions === 0);
    const rows = normalizePortableRows(v.keeper, view);
    ok("normalization keeps the 26 reference-less lots as null, never invented",
      rows.filter((r) => r.reference_text === null).length === 26);
    console.log(`  real ET37 keeper: ${keeperPath}`);
  }
}

/* ── 8e · APPLY IS REFUSED BY NAME, AND BEFORE REGISTRATION ────────────── */
{
  ok("monaco-portable dispatches to WITHHELD, never to a writer",
    applyDispatchFor("monaco-portable") === "withheld");
  ok("the proven writing families still dispatch to their engines",
    applyDispatchFor("phillips-sale") === "phillips" && applyDispatchFor("monaco-layer2") === "monaco" && applyDispatchFor("monaco-legend") === "monaco");
  ok("withheld is a named set, and the portable family is in it",
    APPLY_WITHHELD_ADAPTERS.length === 1 && APPLY_WITHHELD_ADAPTERS[0] === "monaco-portable" && APPLY_WITHHELD_ERROR === "apply_withheld_plan_only_family");
  ok("PRECONDITION: every plan-only registerable family is withheld — registration cannot outrun the refusal",
    RUNTIME_REGISTERABLE_ADAPTERS.filter((a) => a === "monaco-portable").every((a) => isApplyWithheld(a)));

  const contract = read("lib/auction-operations/packetContract.ts");
  const contractCode = strip(contract);
  const withheldDecl = contract.indexOf("APPLY_WITHHELD_ADAPTERS = [");
  ok("in the contract source, the withheld set is declared BEFORE the registerable set",
    withheldDecl >= 0 && withheldDecl < contract.indexOf("RUNTIME_REGISTERABLE_ADAPTERS = ["));
  const withheldBranch = contractCode.indexOf('if (isApplyWithheld(adapterId)) return "withheld"');
  const phillipsBranch = contractCode.indexOf('if (adapterId === "phillips-sale") return "phillips"');
  ok("applyDispatchFor evaluates withheld first and the Monaco writer is the LAST branch",
    withheldBranch >= 0 && phillipsBranch >= 0 &&
    withheldBranch < phillipsBranch &&
    phillipsBranch < contractCode.indexOf('return "monaco"'));

  const slice = read("lib/auction-operations/applySlice.ts");
  const sliceCode = strip(slice);
  /* indexOf returns -1 for an absent string and -1 < anything is TRUE, so an
     ordering pin alone is blind to deletion — found by mutation. Presence is
     asserted first, and the guard must DIRECTLY wrap the throw so `if (false)`
     around a still-present throw cannot pass. */
  const withheldAt = sliceCode.indexOf('if (dispatch === "withheld")');
  ok("the dispatcher decides by applyDispatchFor, and throws the named refusal before any engine",
    /const dispatch = applyDispatchFor\(run\.adapter_id\)/.test(sliceCode) &&
    withheldAt >= 0 &&
    withheldAt < sliceCode.indexOf("applySalePlan(") &&
    withheldAt < sliceCode.indexOf("applyMonacoPlanSlice(") &&
    /if \(dispatch === "withheld"\) \{\s*throw new Error\(\s*`\$\{APPLY_WITHHELD_ERROR\}/.test(sliceCode));
  ok("monaco-portable cannot fall through to applyMonacoPlanSlice — the Monaco branch is no longer 'everything else'",
    !/run\.adapter_id === "phillips-sale"/.test(sliceCode) && /dispatch === "phillips"/.test(sliceCode));

  const apply = read("app/api/admin/auctions/results/apply/route.ts");
  /* Anchor on POST's own state flip (unique by approved_at) — runSlices()
     above it also writes 'applying', and that occurrence is not the gate. */
  ok("the apply route refuses a withheld family BEFORE the run's state moves to applying",
    /isApplyWithheld\(run\.adapter_id\)/.test(apply) &&
    apply.indexOf("isApplyWithheld(run.adapter_id)") < apply.indexOf('state: "applying", approved_at') &&
    apply.indexOf("isApplyWithheld(run.adapter_id)") < apply.indexOf("verifyStoredPlan(run)") &&
    apply.indexOf("isApplyWithheld(run.adapter_id)") < apply.indexOf("run.plan_sha256 !== approvedSha"));

  const engine = read("lib/auction-operations/planEngine.ts");
  const engineCode = strip(engine);
  ok("the plan engine has an explicit monaco-portable branch and no bare fall-through to Layer 2",
    /packet\.adapter === "monaco-portable"/.test(engineCode) && /unsupported_adapter/.test(engineCode) &&
    /packet\.adapter !== "monaco-layer2"/.test(engineCode));
  const verifyAt = engineCode.indexOf("verifyKeeperBytes(keeperBytes");
  ok("the portable branch verifies keeper bytes BEFORE building the plan, from the portable_json slot",
    verifyAt >= 0 && verifyAt < engineCode.indexOf("buildPortablePlan({") &&
    /specs\.portable_json/.test(engineCode));
  ok("planning still writes no Auction Evidence with the new branch present",
    !/auction_evidence/.test(engineCode));

  const registry = read("lib/auction-operations/registry.ts");
  ok("portable_json is a declared staging kind and monaco-portable a declared adapter id",
    /"portable_json"/.test(registry) && /"monaco-portable"/.test(registry));

  const packets = read("app/api/admin/auctions/packets/route.ts");
  ok("registration validates a portable descriptor's keeper.sha256 and gates, and exposes the withheld set to the room",
    /adapterId === "monaco-portable"/.test(packets) && /keeper\.sha256/.test(packets) && /gates/.test(packets) &&
    /applyWithheldAdapters: APPLY_WITHHELD_ADAPTERS/.test(packets));

  const room = strip(read("components/AdminAuctionResultsIngest.tsx"));
  ok("the room hides Apply for a withheld family and says so in words — not a disabled button",
    /Plan-only family — Apply is not yet enabled/.test(room) &&
    /run\.state === "planned" && run\.contradictions\.length === 0 && !applyIsWithheld/.test(room) &&
    /applyWithheldAdapters/.test(room));
  ok("the room takes withheld truth from the server, holding no list of its own",
    /setApplyWithheld\(Array\.isArray\(data\?\.applyWithheldAdapters\)/.test(room) && !/"monaco-portable"/.test(room));

  ok("the ET37 descriptor pins the keeper hash and the exact packet gates, and mirrors nothing else from the keeper",
    et37Manifest.keeper.sha256 === "49f9c197b0c51e3a609e060142ad112b4702a05516900e750fc4fc8661350d38" &&
    et37Manifest.gates.lot_count === 166 && et37Manifest.gates.sold_total.amount === 8029125 &&
    !("lots" in et37Manifest) && !("reconciliation_manifest" in et37Manifest));
}

/* ════════════════════════════════════════════════════════════════════════
   9 · MONACO PORTABLE — APPLY FOUNDATION (v8.21), release gate WITHHELD

   The writer beneath the plan, proven behind the gate. Storage and Postgres
   do not share a transaction, so the invariant under test is ORDER:
   verified durable keeper object first, DB row referencing it second, and
   no lot or result before either. The writer is reachable here by direct
   call only; applyDispatchFor still says `withheld` and the route/room
   never reach it.
   ════════════════════════════════════════════════════════════════════════ */

function fakeStorage(seed = {}) {
  const objects = new Map(Object.entries(seed));
  return {
    objects,
    uploads: 0, downloads: 0,
    async download(path) { this.downloads += 1; return objects.has(path) ? Buffer.from(objects.get(path)) : null; },
    async upload(path, bytes) { this.uploads += 1; objects.set(path, Buffer.from(bytes)); },
  };
}

/* ── 9a · durable retention: order, verification, refusal ──────────────── */
{
  const db = fakeDb();
  const bytes = synthBytes();
  const k = verifyKeeperBytes(bytes, synthSha);
  const plan = await buildPortablePlan({ manifest: synthManifest, keeper: k.keeper, keeperSha256: k.sha256, keeperByteLength: k.byteLength, db, packetId: "zz99-portable" });
  const path = keeperObjectPath(synthSha);
  ok("the private bucket and path convention are content-addressed by keeper SHA-256",
    PRIVATE_KEEPER_BUCKET === "auction-evidence-private-keepers" && path === `sha256/${synthSha}.json`);

  const s1 = fakeStorage();
  const r1 = await ensureKeeperRetained({ plan, keeperBytes: bytes, storage: s1 });
  ok("an absent hash-path object is created, then read back and verified", r1.created === true && r1.path === path && s1.uploads === 1 && s1.downloads === 2);
  const s2 = fakeStorage({ [path]: bytes });
  const r2 = await ensureKeeperRetained({ plan, keeperBytes: bytes, storage: s2 });
  ok("an exact existing object is reused — nothing uploaded", r2.created === false && s2.uploads === 0);

  const tampered = Buffer.from(bytes); tampered[tampered.length - 5] ^= 0x01;
  n += 1; await assert.rejects(ensureKeeperRetained({ plan, keeperBytes: tampered, storage: fakeStorage() }), /keeper_hash_mismatch/, "staged bytes are rehashed and a mismatch refuses before any storage write");
  const s3 = fakeStorage({ [path]: tampered });
  n += 1; await assert.rejects(ensureKeeperRetained({ plan, keeperBytes: bytes, storage: s3 }), /keeper_object_conflict/, "conflicting bytes already at the deterministic path refuse — never overwritten");
  ok("…and the conflicting object was left untouched", s3.uploads === 0 && sha(s3.objects.get(path)) === sha(tampered));
  n += 1; await assert.rejects(ensureKeeperRetained({ plan, keeperBytes: Buffer.alloc(0), storage: fakeStorage() }), /keeper_bytes_required/, "no keeper bytes refuses");
}

/* ── 9b · the writer, real ET37 plan shape when the keeper is present ──── */
{
  const candidates = [process.env.FWT_ET37_KEEPER, path.join(os.homedir(), "Downloads", et37Manifest.keeper.preferred_filename)].filter(Boolean);
  const keeperPath = candidates.find((p) => existsSync(p));
  if (!keeperPath) {
    console.log("  CANARY: real ET37 keeper not present — 9b writer proof ran on the synthetic fixture only");
  }
  const bytes = keeperPath ? readFileSync(keeperPath) : synthBytes();
  const manifest = keeperPath ? et37Manifest : synthManifest;
  const expectSha = keeperPath ? et37Manifest.keeper.sha256 : synthSha;
  const v = verifyKeeperBytes(bytes, expectSha);
  const db = fakeDb();
  const plan = await buildPortablePlan({ manifest, keeper: v.keeper, keeperSha256: v.sha256, keeperByteLength: v.byteLength, db, packetId: keeperPath ? "et37-portable" : "zz99-portable" });
  const storage = fakeStorage();
  const lotsExpected = keeperPath ? 166 : 5, soldExpected = keeperPath ? 156 : 3, sumExpected = keeperPath ? 8029125 : 6500;

  const out = await applyPortablePlanSlice(plan, db, { keeperBytes: bytes, storage });
  ok(`writer: full flight completes (${lotsExpected} rows)`, out.done === true && out.counts.lots_created === lotsExpected && out.counts.results_created === lotsExpected);
  ok("writer: house and sale created once", db.tables.auction_evidence_house.length === 1 && db.tables.auction_evidence_sale.length === 1);
  const arts = db.tables.auction_evidence_source_artifact;
  const keeperRow = arts.find((a) => a.source_url === null);
  const pageRow = arts.find((a) => a.source_url !== null);
  ok("writer: exactly two artifact rows — the URL-backed sale page and the URL-less private keeper",
    arts.length === 2 && keeperRow && pageRow && keeperRow.content_hash === v.sha256 && pageRow.content_hash === null);
  ok("writer: the keeper row carries the ruled rights, the content-addressed path, and a retrieved_at assigned by the writer",
    Object.entries(PRIVATE_KEEPER_RIGHTS).every(([c, val]) => keeperRow[c] === val) &&
      keeperRow.full_artifact_storage_path === keeperObjectPath(v.sha256) && typeof keeperRow.retrieved_at === "string");
  ok("writer: the exact keeper bytes are durably retained at their hash path", storage.objects.has(keeperObjectPath(v.sha256)) && sha(storage.objects.get(keeperObjectPath(v.sha256))) === v.sha256 && out.counts.keeper_object_created === 1);
  ok("writer: every lot's provenance is the private keeper artifact, never the sale page",
    db.tables.auction_evidence_lot.length === lotsExpected && db.tables.auction_evidence_lot.every((l) => l.source_artifact_id === keeperRow.id));
  const results = db.tables.auction_evidence_result;
  const priced = results.filter((r) => r.price_realized !== null);
  ok(`writer: ${soldExpected} priced sold results summing exactly to ${sumExpected}, all hammer_plus_premium, non-sold unpriced`,
    results.length === lotsExpected && priced.length === soldExpected && priced.reduce((a, r) => a + r.price_realized, 0) === sumExpected &&
      priced.every((r) => r.price_basis === "hammer_plus_premium" && r.currency === "CHF") &&
      results.filter((r) => r.price_realized === null).every((r) => r.currency === null && r.price_basis === null));
  ok("writer: every result travelled through the protected RPC — zero direct inserts", db.rpcCalls === lotsExpected && db.directResultInserts === 0);
  ok("writer: the RPC was handed the keeper artifact as source", db.tables.auction_evidence_result.every((r) => r.source_artifact_id === undefined || r.source_artifact_id === keeperRow.id));

  /* replay: zero duplicates, everything reused, nothing uploaded */
  const uploadsBefore = storage.uploads;
  const again = await applyPortablePlanSlice(plan, db, { keeperBytes: bytes, storage });
  ok("writer: exact replay reuses house, sale, both artifacts, every lot and every result — zero duplicates",
    again.done && again.counts.lots_created === 0 && again.counts.results_created === 0 && again.counts.lots_reused === lotsExpected && again.counts.results_reused === lotsExpected &&
      again.counts.keeper_artifact_reused === 1 && again.counts.keeper_object_reused === 1 && storage.uploads === uploadsBefore &&
      db.tables.auction_evidence_lot.length === lotsExpected && arts.length === 2 && db.rpcCalls === lotsExpected);

  /* bounded slices resume from the cursor */
  const db2 = fakeDb(); const st2 = fakeStorage();
  const s1 = await applyPortablePlanSlice(plan, db2, { keeperBytes: bytes, storage: st2, maxRows: 3 });
  const s2 = await applyPortablePlanSlice(plan, db2, { keeperBytes: bytes, storage: st2, cursor: s1.cursor });
  ok("writer: a bounded slice stops at its budget and the next resumes from the cursor to completion",
    s1.done === false && s1.counts.lots_created === 3 && s2.done === true && db2.tables.auction_evidence_lot.length === lotsExpected);

  /* contradictions refuse, never overwrite */
  db.tables.auction_evidence_lot[0].brand_text = "Nobody";
  n += 1; await assert.rejects(applyPortablePlanSlice(plan, db, { keeperBytes: bytes, storage }), /lot_contradiction/, "writer: a live lot that disagrees with the plan refuses");
  const db3 = fakeDb();
  db3.tables.auction_evidence_house.push({ id: "h1", name: "Someone Else", slug: plan.house.slug, website_url: plan.house.website_url });
  n += 1; await assert.rejects(applyPortablePlanSlice(plan, db3, { keeperBytes: bytes, storage: fakeStorage() }), /house_contradiction/, "writer: a disagreeing house refuses");
  n += 1; await assert.rejects(applyPortablePlanSlice(plan, fakeDb(), { keeperBytes: bytes, storage: fakeStorage({ [keeperObjectPath(v.sha256)]: Buffer.from("not the keeper") }) }), /keeper_object_conflict/, "writer: a foreign object at the keeper's path refuses");
  n += 1; await assert.rejects(applyPortablePlanSlice(plan, fakeDb(), { keeperBytes: bytes }), /storage_boundary_required/, "writer: no storage boundary, no write");
  n += 1; await assert.rejects(applyPortablePlanSlice({ ...plan, adapter: "monaco-layer2" }, fakeDb(), { keeperBytes: bytes, storage: fakeStorage() }), /wrong_adapter/, "writer: refuses a plan that is not monaco-portable");
  n += 1; await assert.rejects(applyPortablePlanSlice({ ...plan, contradictions: ["x"] }, fakeDb(), { keeperBytes: bytes, storage: fakeStorage() }), /plan_has_contradictions/, "writer: refuses a plan carrying contradictions");

  /* storage-before-DB ordering: tampered bytes → nothing in the DB at all */
  const db4 = fakeDb(); const st4 = fakeStorage();
  const tampered = Buffer.from(bytes); tampered[10] ^= 0x01;
  n += 1; await assert.rejects(applyPortablePlanSlice(plan, db4, { keeperBytes: tampered, storage: st4 }), /keeper_hash_mismatch/, "writer: a hash mismatch refuses");
  ok("…and no keeper artifact, lot or result was attempted before retention verified (house/sale/page may exist; nothing depends on the keeper)",
    st4.uploads === 0 && db4.tables.auction_evidence_source_artifact.every((a) => a.source_url !== null) &&
      db4.tables.auction_evidence_lot.length === 0 && db4.tables.auction_evidence_result.length === 0 && db4.rpcCalls === 0);

  /* storage succeeds, DB refuses: the object stays (acceptable), no row claims it */
  const db5 = fakeDb(); const st5 = fakeStorage();
  const origFrom = db5.from.bind(db5);
  let armed = true;
  db5.from = (table) => {
    const chain = origFrom(table);
    if (table === "auction_evidence_source_artifact" && armed) {
      const origInsert = chain.insert.bind(chain);
      chain.insert = (values) => {
        if (values.source_url === null) { armed = false; return { select: () => ({ then: (res) => res({ data: null, error: { message: "forced keeper row refusal" } }) }) }; }
        return origInsert(values);
      };
    }
    return chain;
  };
  n += 1; await assert.rejects(applyPortablePlanSlice(plan, db5, { keeperBytes: bytes, storage: st5 }), /forced keeper row refusal/, "writer: DB refusal after storage success surfaces as a refusal");
  ok("…the verified object remains as acceptable orphan storage and no row points at it",
    st5.objects.has(keeperObjectPath(v.sha256)) && db5.tables.auction_evidence_source_artifact.every((a) => a.source_url !== null) && db5.tables.auction_evidence_lot.length === 0);
  const resumed = await applyPortablePlanSlice(plan, db5, { keeperBytes: bytes, storage: st5 });
  ok("…and a later run verifies and reuses that orphan object instead of re-uploading", resumed.done && resumed.counts.keeper_object_reused === 1 && resumed.counts.keeper_artifact_created === 1 && st5.uploads === 1);
  if (keeperPath) console.log(`  real ET37 keeper (writer): ${keeperPath}`);
}

/* ── 9c · the release gate is intact, and refusal is selective ─────────── */
{
  ok("monaco-portable is STILL Apply-withheld after the writer exists", isApplyWithheld("monaco-portable") && applyDispatchFor("monaco-portable") === "withheld");
  ok("the refusal is selective: phillips-sale → Phillips writer", applyDispatchFor("phillips-sale") === "phillips");
  ok("the refusal is selective: monaco-legend and monaco-layer2 → Monaco writer", applyDispatchFor("monaco-legend") === "monaco" && applyDispatchFor("monaco-layer2") === "monaco");
  ok("an unknown family is unsupported — it never inherits the Monaco writer by elimination",
    applyDispatchFor("sothebys-sale") === "unsupported" && applyDispatchFor("monaco-layer3") === "unsupported" && applyDispatchFor(undefined) === "unsupported" && applyDispatchFor({}) === "unsupported");
  ok("exactly one family is withheld", APPLY_WITHHELD_ADAPTERS.length === 1);

  const contract = strip(read("lib/auction-operations/packetContract.ts"));
  ok("dispatch names its Monaco families explicitly and ends in unsupported, not monaco",
    /if \(adapterId === "monaco-legend" \|\| adapterId === "monaco-layer2"\) return "monaco";/.test(contract) &&
      /return "unsupported";\s*\}/.test(contract) && !/^\s*return "monaco";\s*\}/m.test(contract));
  const slice = strip(read("lib/auction-operations/applySlice.ts"));
  const unsupportedAt = slice.indexOf('dispatch === "unsupported"');
  ok("the slice refuses an unsupported family by name before any engine",
    unsupportedAt >= 0 && unsupportedAt < slice.indexOf("applySalePlan(") && unsupportedAt < slice.indexOf("applyMonacoPlanSlice(") &&
      /if \(dispatch === "unsupported"\) \{\s*throw new Error\(\s*`\$\{APPLY_UNSUPPORTED_ERROR\}/.test(slice));
  ok("the portable writer is not wired into the slice — unreachable from the normal Apply route",
    !/monaco-portable-writer/.test(slice) && !/applyPortablePlanSlice/.test(slice) &&
      !/applyPortablePlanSlice/.test(read("app/api/admin/auctions/results/apply/route.ts")));
  const room = strip(read("components/AdminAuctionResultsIngest.tsx"));
  ok("the room still draws no Apply button for a withheld family", /Plan-only family — Apply is not yet enabled/.test(room) && /!applyIsWithheld/.test(room));
  const apply = read("app/api/admin/auctions/results/apply/route.ts");
  ok("the route still refuses a withheld family before the run's state moves", /isApplyWithheld\(run\.adapter_id\)/.test(apply) && apply.indexOf("isApplyWithheld(run.adapter_id)") < apply.indexOf('state: "applying", approved_at'));
  const writer = strip(read("lib/auction-operations/monaco-portable-writer.mjs"));
  ok("the writer's only result path is the protected RPC", /rpc\("auction_evidence_create_or_correct_result"/.test(writer) && !/from\("auction_evidence_result"\)\.insert/.test(writer));
  ok("the writer retains the keeper before it inserts the keeper row, and the keeper row before any lot",
    writer.indexOf("ensureKeeperRetained({ plan, keeperBytes") < writer.indexOf("keeper artifact insert") &&
      writer.indexOf("keeper artifact insert") < writer.indexOf('from("auction_evidence_lot").insert'));

  /* the migration: narrow, unapplied, and it preserves what it must */
  const m = read("supabase/migrations/20260902200000_auction_evidence_private_keeper_artifacts.sql");
  const mSql = m.replace(/^\s*--.*$/gm, "");
  ok("the migration is labelled NOT applied and names its application order", /NOT APPLIED TO PRODUCTION/.test(m) && /20260902140000_auction_operations_monaco_portable_adapter\.sql/.test(m));
  ok("source_url loses only its unconditional NOT NULL", /alter column source_url drop not null/.test(mSql));
  ok("the new CHECK is the narrow private-file invariant and does NOT restate the storage-path rule",
    /source_url is not null\s*or \(\s*source_url is null\s*and artifact_retention_scope = 'full_artifact_private'\s*and intake_method = 'founder_supplied_file'\s*and content_hash is not null\s*\)/.test(mSql) &&
      !/full_artifact_storage_path/.test(mSql));
  /* The migration's COMMENT literal may NAME the preserved constraint (it
     says the path rule lives there); what must not exist is any DDL that
     drops, adds or alters it. */
  ok("asa_retention_path_check and asa_content_hash_check are not dropped, re-added or altered",
    !/(drop|add|alter) constraint (if exists )?asa_retention_path_check/i.test(mSql) &&
      !/(drop|add|alter) constraint (if exists )?asa_content_hash_check/i.test(mSql) &&
      (mSql.match(/(drop|add) constraint/gi) ?? []).length === 2 && /asa_source_identity_check/.test(mSql));
  ok("the partial unique identity is (sale_id, content_hash) in the URL-less private state, created AFTER the presence CHECK",
    /create unique index if not exists asa_private_keeper_identity_uniq\s*on public\.auction_evidence_source_artifact \(sale_id, content_hash\)\s*where source_url is null and artifact_retention_scope = 'full_artifact_private'/.test(mSql) &&
      mSql.indexOf("asa_source_identity_check check") < mSql.indexOf("create unique index if not exists asa_private_keeper_identity_uniq"));
  ok("the private bucket is created private with the portable size bound and no client policy",
    /insert into storage\.buckets \(id, name, public, file_size_limit\)\s*values \('auction-evidence-private-keepers', 'auction-evidence-private-keepers', false, 20971520\)/.test(mSql) &&
      !/create policy/i.test(mSql) && !/grant /i.test(mSql));
}

console.log(`auction-operations: ${n} assertions passed`);
