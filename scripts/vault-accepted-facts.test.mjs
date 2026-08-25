/* ════════════════════════════════════════════════════════════════════════
   ACCEPTED RESEARCH FACTS — unchanged fact survives, changed fact reopens.

   Run: node --experimental-strip-types scripts/vault-accepted-facts.test.mjs

   The defect under test is not subtle once it is named: accepted research
   was reachable only through a work item keyed by `sourceSha256`, so one
   edited byte produced a new key and every already-established fact in the
   file was researched again.

   These assertions are about the KEY and the FINGERPRINT, because that is
   where the defect lived. The proof case below walks the exact sequence the
   order asks for against a representative Nivada Grenchen shape — 20
   collections, 35 families, 68 variants in production — using the real
   partitioner, not a stand-in.
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import {
  buildAcceptedFact,
  decideReuse,
  factInputFingerprint,
  factKey,
  factLocator,
  causalInputsOf,
  partitionByAcceptedFacts,
} from "../lib/vault-upgrade/acceptedFacts.ts";

let n = 0;
const ok = (label, cond) => { n += 1; assert.ok(cond, label); };

const V = {
  specificationSha256: "spec-v3.2-aaaa",
  upgradeRuleVersion: "upgrade-rule-v1",
  normalizationVersion: "normalization-v1",
  engineVersion: "upgrade-engine-v1",
};
const BRAND = "Nivada Grenchen";

/** A variant-level request at a given position, for a given watch. */
const variantReq = (ci, fi, vi, { collection, family, variant, field = "description" }) => ({
  path: `/Collections/${ci}/Families/${fi}/Variants/${vi}/${field}`,
  field,
  kind: field === "description" ? "variant-description" : "variant-notes",
  wordRange: field === "description" ? [20, 50] : undefined,
  context: {
    brand: BRAND, collection, family, variant,
    /* Sibling state — present in the real context, and deliberately not
       part of what identifies or invalidates this fact. */
    existingReferences: [], existingNotes: null, existingAliases: [],
  },
});

/* The default matters: a bare brandReq("region") must carry the SAME
   vocabulary the first round accepted under, or the fingerprint
   legitimately differs and the fact correctly reopens - which is the
   rule working, not the fixture. */
const REGION_ENUM = ["Europe", "Asia", "North America"];
const brandReq = (field, allowedValues = field === "region" ? REGION_ENUM : undefined) => ({
  path: `/${field}`,
  field,
  kind: "brand-fact",
  allowedValues,
  context: { brand: BRAND, knownFields: {}, collectionNames: ["Antarctic"] },
});

const store = () => {
  const rows = new Map();
  return {
    rows,
    get: async (keys) => {
      const out = new Map();
      for (const k of keys) if (rows.has(k)) out.set(k, rows.get(k));
      return out;
    },
    put: async (facts) => { for (const f of facts) rows.set(f.factKey, f); },
  };
};

// ── 1 · identity is index-free ──────────────────────────────────────────
{
  const a = variantReq(0, 0, 0, { collection: "Antarctic", family: "Diver", variant: "Blue" });
  const b = variantReq(7, 3, 2, { collection: "Antarctic", family: "Diver", variant: "Blue" });
  ok("the same watch at a different position is the same fact",
    (await factKey(BRAND, a, V)) === (await factKey(BRAND, b, V)));
  ok("locator carries names, never indices",
    JSON.stringify(factLocator(a)) === JSON.stringify(["antarctic", "diver", "blue"]));

  const brand = brandReq("description");
  ok("a brand-level fact is located by its stable pointer",
    JSON.stringify(factLocator(brand)) === JSON.stringify(["/description"]));
}

// ── 2 · sibling state does not touch the fingerprint ────────────────────
{
  const before = variantReq(0, 0, 0, { collection: "Antarctic", family: "Diver", variant: "Blue" });
  const after = structuredClone(before);
  after.context.existingNotes = "Filled in by this very run.";
  after.context.existingReferences = ["NG-1", "NG-2"];
  ok("filling a sibling field does not reopen this fact",
    (await factInputFingerprint(before)) === (await factInputFingerprint(after)));
}

// ── 3 · the version axis ────────────────────────────────────────────────
{
  const r = variantReq(0, 0, 0, { collection: "Antarctic", family: "Diver", variant: "Blue" });
  const base = await factKey(BRAND, r, V);
  for (const [field, value] of [
    ["specificationSha256", "spec-v3.3-bbbb"],
    ["upgradeRuleVersion", "upgrade-rule-v2"],
    ["normalizationVersion", "normalization-v2"],
    ["engineVersion", "upgrade-engine-v2"],
  ]) {
    ok(`a change of ${field} makes it a different fact`,
      (await factKey(BRAND, r, { ...V, [field]: value })) !== base);
  }
}

// ── 4 · the reuse rule itself ───────────────────────────────────────────
{
  const r = variantReq(0, 0, 0, { collection: "Antarctic", family: "Diver", variant: "Blue" });
  const fp = await factInputFingerprint(r);
  const fact = await buildAcceptedFact({
    brandName: BRAND, request: r, value: "A blue-dialled Antarctic diver.",
    evidence: [{ url: "https://example.test" }], sourceSha256: "aaaa1111",
    versions: V, nowIso: "2026-08-25T00:00:00.000Z",
  });
  ok("never accepted → research", decideReuse(undefined, fp).verdict === "research");
  ok("unchanged inputs → reuse", decideReuse(fact, fp).verdict === "reuse");
  ok("changed inputs → reopen",
    decideReuse(fact, "different-fingerprint").verdict === "reopen");
  ok("a reopen names the fact it supersedes",
    decideReuse(fact, "different-fingerprint").previous.factKey === fact.factKey);
  ok("provenance carries the source it was established against",
    fact.sourceSha256 === "aaaa1111" && fact.acceptedAtPath === r.path);
  ok("evidence is carried forward verbatim",
    JSON.stringify(fact.evidence) === JSON.stringify([{ url: "https://example.test" }]));
}

/* ══ THE PROOF CASE ═══════════════════════════════════════════════════════
   Representative shape: three variants across two families, plus two
   brand-level facts. Walks the seven steps the order names. */
{
  const db = store();
  const watches = [
    { collection: "Antarctic", family: "Diver", variant: "Blue" },
    { collection: "Antarctic", family: "Diver", variant: "Black" },
    { collection: "Chronomaster", family: "Aviator", variant: "Sea Diver" },
  ];
  const round = (opts = {}) => [
    ...watches.map((w, i) => variantReq(0, 0, i, { ...w, ...(opts.override?.(w) ?? {}) })),
    brandReq("description"),
    brandReq("region", opts.regionValues ?? ["Europe", "Asia", "North America"]),
  ];

  // 1 · first run — nothing is known, everything is researched
  const first = await partitionByAcceptedFacts(BRAND, round(), V, db.get);
  ok("first run researches every pointer", first.toResearch.length === 5);
  ok("first run reuses nothing", first.reused.length === 0);

  // …and the run accepts them
  for (const request of round()) {
    await db.put([await buildAcceptedFact({
      brandName: BRAND, request, value: `accepted:${request.path}`,
      evidence: [{ url: "https://source.test" }], sourceSha256: "source-v1",
      versions: V, nowIso: "2026-08-25T00:00:00.000Z",
    })]);
  }
  ok("five accepted facts persisted", db.rows.size === 5);

  // 2-3 · an UNRELATED byte changes: a fourth variant is inserted ABOVE the
  //       others, shifting every index. Old key would have lost everything.
  const shifted = [
    ...watches.map((w, i) => variantReq(3, 9, i + 1, w)),
    brandReq("description"),
    brandReq("region"),
  ];
  const second = await partitionByAcceptedFacts(BRAND, shifted, V, db.get);
  ok("an unrelated edit reopens nothing", second.reopened.length === 0);
  ok("every unchanged fact is reused", second.reused.length === 5);
  ok("ZERO pointers reach the provider", second.toResearch.length === 0);

  // 4-5 · the relevant input for ONE fact changes: region's vocabulary is
  //       narrowed. That fact alone must reopen.
  const narrowed = [
    ...watches.map((w, i) => variantReq(3, 9, i + 1, w)),
    brandReq("description"),
    brandReq("region", ["Europe", "Asia"]),
  ];
  const third = await partitionByAcceptedFacts(BRAND, narrowed, V, db.get);
  ok("exactly one fact reopens", third.reopened.length === 1);
  ok("it is the one whose input actually moved",
    third.reopened[0].request.field === "region");
  ok("only that one is researched", third.toResearch.length === 1);
  ok("the other four are still reused", third.reused.length === 4);

  // …and a renamed watch is a different watch
  const renamed = [
    variantReq(3, 9, 1, { collection: "Antarctic", family: "Diver", variant: "Blue" }),
    variantReq(3, 9, 2, { collection: "Antarctic", family: "Diver", variant: "Gilt" }),
    variantReq(3, 9, 3, watches[2]),
    brandReq("description"),
    brandReq("region"),
  ];
  const fourth = await partitionByAcceptedFacts(BRAND, renamed, V, db.get);
  ok("a renamed variant is researched, not silently reused",
    fourth.toResearch.length === 1 && fourth.toResearch[0].context.variant === "Gilt");

  // 6 · provenance stays truthful across all of it
  const anyFact = [...db.rows.values()][0];
  ok("source hash history survives untouched", anyFact.sourceSha256 === "source-v1");
  ok("every stored fact names its spec and engine versions",
    [...db.rows.values()].every((f) =>
      f.specificationSha256 === V.specificationSha256 &&
      f.engineVersion === V.engineVersion));

  // 7 · prior-success preservation: a fact accepted under one source is
  //     still evidence after the source moves on
  ok("accepted facts outlive the source bytes that produced them",
    db.rows.size === 5 && second.reused.every((r) => r.fact.sourceSha256 === "source-v1"));

  // headline
  const avoided = second.reused.length + third.reused.length;
  ok("provider pointers avoided across two reruns is 9", avoided === 9);
}

console.log(`vault-accepted-facts: ${n} assertions PASS`);

/* ══ CAUSAL-INPUT INVALIDATION ════════════════════════════════════════════
   Acceptance law: a fact may be reused only when every input capable of
   changing the truthful answer remains semantically equivalent.

   The research instructions say "Never contradict a fact the file already
   asserts. Preserved values are given to you as context - treat them as
   true." So preserved values that are UPSTREAM of a field are causal, and
   an earlier build that omitted all of knownFields was wrong. These prove
   both directions, and prove the omissions that remain are correct. */
{
  const brandWith = (field, known, allowedValues) => ({
    path: `/${field}`,
    field,
    kind: "brand-fact",
    allowedValues: allowedValues ?? (field === "region" ? REGION_ENUM : undefined),
    context: {
      brand: BRAND,
      collectionNames: ["Antarctic"],
      searchAliases: ["Nivada"],
      knownFields: known,
    },
  });

  const fp = (r) => factInputFingerprint(r);

  // ── DIRECTION 2 · a genuinely causal input moves → the fact reopens ────
  {
    const jp = brandWith("region", { country_of_origin: "Japan" });
    const ch = brandWith("region", { country_of_origin: "Switzerland" });
    ok("locator, field, kind, allowedValues and wordRange are all unchanged",
      (await factKey(BRAND, jp, V)) === (await factKey(BRAND, ch, V)) &&
      JSON.stringify(jp.allowedValues) === JSON.stringify(ch.allowedValues));
    ok("changing country_of_origin REOPENS region", (await fp(jp)) !== (await fp(ch)));

    const c1 = brandWith("cluster", { country_of_origin: "Japan" });
    const c2 = brandWith("cluster", { country_of_origin: "Germany" });
    ok("changing country_of_origin REOPENS cluster", (await fp(c1)) !== (await fp(c2)));

    const r1 = brandWith("cluster_rationale", { cluster: "Japanese" });
    const r2 = brandWith("cluster_rationale", { cluster: "German" });
    ok("changing cluster REOPENS cluster_rationale", (await fp(r1)) !== (await fp(r2)));

    const v1 = brandWith("revival_type", { revival_status: "revived" });
    const v2 = brandWith("revival_type", { revival_status: "active" });
    ok("changing revival_status REOPENS revival_type", (await fp(v1)) !== (await fp(v2)));

    const d1 = brandWith("description", { country_of_origin: "Switzerland", independent_status: "independent" });
    const d2 = brandWith("description", { country_of_origin: "Switzerland", independent_status: "group-owned" });
    ok("changing independent_status REOPENS the brand description",
      (await fp(d1)) !== (await fp(d2)));
  }

  // ── DIRECTION 1 · irrelevant state moves → the fact stays reusable ─────
  {
    const a = brandWith("region", { country_of_origin: "Japan", cluster: "Japanese", description: "old" });
    const b = brandWith("region", { country_of_origin: "Japan", cluster: "German", description: "rewritten this very run" });
    ok("a DOWNSTREAM sibling moving does not reopen region", (await fp(a)) === (await fp(b)));

    const c = brandWith("region", { country_of_origin: "Japan" });
    const d = { ...brandWith("region", { country_of_origin: "Japan" }),
      context: { brand: BRAND, collectionNames: ["Antarctic", "Chronomaster", "Depthmaster"],
                 searchAliases: ["Nivada", "Nivada Grenchen SA"],
                 knownFields: { country_of_origin: "Japan" } } };
    ok("collectionNames and searchAliases moving do not reopen region",
      (await fp(c)) === (await fp(d)));

    /* Self-invalidation guard: filling the field itself must not reopen it. */
    const e = brandWith("cluster", { country_of_origin: "Japan" });
    const f = brandWith("cluster", { country_of_origin: "Japan", cluster: "Japanese" });
    ok("a field appearing in knownFields does not reopen itself",
      (await fp(e)) === (await fp(f)));

    /* Semantic equivalence, not byte equality. */
    const g = brandWith("region", { country_of_origin: "Switzerland" });
    const h = brandWith("region", { country_of_origin: "  switzerland  " });
    ok("case and whitespace edits are semantically equivalent - no reopen",
      (await fp(g)) === (await fp(h)));

    /* Variant facts have no causal parents - sibling/output state only. */
    const v = variantReq(0, 0, 0, { collection: "Antarctic", family: "Diver", variant: "Blue" });
    const w = structuredClone(v);
    w.context.existingReferences = ["NG-1"];
    w.context.existingNotes = "38mm, hand-wound.";
    w.context.existingAliases = ["Antarctic Diver"];
    ok("variant sibling/output state still does not reopen a variant fact",
      (await fp(v)) === (await fp(w)));

    /* A field with no parents cannot be reopened by preserved values. */
    const p1 = brandWith("country_of_origin", { region: "Asia" });
    const p2 = brandWith("country_of_origin", { region: "Europe" });
    ok("a parentless field is unaffected by other preserved values",
      (await fp(p1)) === (await fp(p2)));
  }
}

console.log(`vault-accepted-facts (causal): ${n} assertions PASS`);
