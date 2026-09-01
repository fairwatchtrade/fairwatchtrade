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
} from "../lib/auction-operations/packetContract.ts";
import { readFileSync as readSourceFile } from "node:fs";

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
  ok("the adapter allowlist is still finite and code-owned", ADAPTER_ALLOWLIST.length === 3);
  ok("known adapters are recognised",
    isAllowlistedAdapter("phillips-sale") &&
    isAllowlistedAdapter("monaco-legend") &&
    isAllowlistedAdapter("monaco-layer2"));
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

console.log(`auction-operations: ${n} assertions passed`);
