/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — CLAIM-LINKED COMPOSITION BEHAVIOR TESTS

   Run: node scripts/dossier-composition.test.mjs

   No network, no DB, no model: the pipeline runs against an in-memory
   store and scripted role callers, so every assertion is about the
   governed behavior itself. The build-order proof list (§20) maps onto
   the sections below.
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const {
  composableClaims,
  parseComposerOutput,
  staleBasisRefusal,
  toPublicSections,
} = await import("../lib/dossier/composition.ts");
const { deterministicFidelityCheck } = await import(
  "../lib/dossier/fidelityVerification.ts"
);
const { runCompositionAttempt, candidateSha256 } = await import(
  "../lib/dossier/compositionPipeline.ts"
);

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok      ${name}`);
  } else {
    failed += 1;
    console.log(`  FAILED  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const IDENTITY = {
  brand: "Breitling",
  collection: "Chronomat",
  model: "Chronomat B01 42",
  reference: "UB0134101B1U1",
};

const claim = (over) => ({
  claimKey: "B01",
  claimClass: "OBJECTIVE_FACT",
  admission: "ADMITTED",
  evidenceBinding: "RETRIEVAL_BOUND",
  subject: "case.diameter_mm",
  statement: "The case measures 42 mm in diameter.",
  values: ["42 mm"],
  qualifier: null,
  supports: [],
  moduleHint: "AT_A_GLANCE",
  ...over,
});

const PACKET = [
  claim({}),
  claim({
    claimKey: "B02",
    subject: "case.water_resistance",
    statement: "The model is specified for 200 m of water resistance.",
    values: ["200 m"],
    qualifier:
      "describes the original model specification, not the present condition of an individual watch",
  }),
  claim({
    claimKey: "B04",
    subject: "movement.power_reserve",
    statement: "The calibre offers approximately 70 hours of power reserve.",
    values: ["70 hrs"],
    moduleHint: "MOVEMENT",
  }),
  claim({
    claimKey: "B05",
    subject: "movement.frequency",
    statement: "The calibre runs at 28,800 vibrations per hour.",
    values: ["28,800"],
    moduleHint: "MOVEMENT",
  }),
  claim({
    claimKey: "B20",
    claimClass: "CONTEXTUAL_FACT",
    subject: "history.chronomat_line",
    statement: "Retailer documentation ties the Chronomat line to 1984.",
    values: ["1984"],
    moduleHint: "HISTORY",
  }),
  claim({
    claimKey: "SIB",
    claimClass: "CONTEXTUAL_FACT",
    subject: "siblings.bracelet_variant",
    statement:
      "A documented sibling configuration on a bracelet is reference UB0134101B1A1.",
    values: ["UB0134101B1A1"],
    moduleHint: "SIBLINGS",
  }),
  claim({
    claimKey: "D01",
    claimClass: "DESIGN_DESCRIPTION",
    subject: "bezel.rider_tabs",
    statement: "The bezel carries four rider tabs at the quarters.",
    values: [],
    supports: ["B01"],
    moduleHint: "CASE_AND_BEZEL",
  }),
];

/* ── 1 · Composer input rule ──────────────────────────────────────────── */
console.log("── eligibility: only ADMITTED + RETRIEVAL_BOUND + current ─────");
{
  const mixed = [
    claim({}),
    claim({ claimKey: "U1", evidenceBinding: "UNBOUND" }),
    claim({ claimKey: "P1", admission: "PENDING_REVIEW", evidenceBinding: "UNBOUND" }),
    claim({ claimKey: "R1", admission: "REFUSED", evidenceBinding: "UNBOUND" }),
    claim({ claimKey: "R2", admission: "REFUSED", evidenceBinding: "RETRIEVAL_BOUND" }),
    claim({
      claimKey: "D_ON_BOUND",
      claimClass: "DESIGN_DESCRIPTION",
      supports: ["B01"],
    }),
    claim({
      claimKey: "D_ON_UNBOUND",
      claimClass: "DESIGN_DESCRIPTION",
      supports: ["U1"],
    }),
    claim({
      claimKey: "D_NO_SUPPORT",
      claimClass: "DESIGN_DESCRIPTION",
      supports: [],
    }),
  ];
  const keys = composableClaims(mixed).map((c) => c.claimKey);
  check("bound admitted claim is composable", keys.includes("B01"));
  check("UNBOUND admitted claim is excluded", !keys.includes("U1"));
  check("PENDING_REVIEW is excluded", !keys.includes("P1"));
  check("REFUSED is excluded (unbound)", !keys.includes("R1"));
  check("REFUSED is excluded (even retrieval-bound)", !keys.includes("R2"));
  check("design claim resting on bound claim is composable", keys.includes("D_ON_BOUND"));
  check("design claim resting on UNBOUND claim is excluded", !keys.includes("D_ON_UNBOUND"));
  check("design claim with no supports is excluded", !keys.includes("D_NO_SUPPORT"));
}

/* ── 2 · Composer output structure ────────────────────────────────────── */
console.log("── structural validation of composer output ───────────────────");
{
  const keys = PACKET.map((c) => c.claimKey);
  const bad1 = parseComposerOutput("not json at all", keys);
  check(
    "malformed output refuses COMPOSER_OUTPUT_MALFORMED",
    bad1.composition === null &&
      bad1.refusals.some((r) => r.code === "COMPOSER_OUTPUT_MALFORMED")
  );

  const noLinkage = JSON.stringify({
    openingIdentity: "Reference UB0134101B1U1.",
    sections: [
      { moduleId: "A", heading: "A", paragraphs: [{ text: "Some prose." }] },
    ],
  });
  const bad2 = parseComposerOutput(noLinkage, keys);
  check(
    "paragraph without claim linkage refuses",
    bad2.composition === null &&
      bad2.refusals.some((r) => r.code === "PARAGRAPH_WITHOUT_CLAIM_LINKAGE")
  );

  const unknown = JSON.stringify({
    openingIdentity: "Reference UB0134101B1U1.",
    sections: [
      {
        moduleId: "A",
        heading: "A",
        paragraphs: [{ text: "Some prose.", claimIds: ["NOT_A_CLAIM"] }],
      },
    ],
  });
  const bad3 = parseComposerOutput(unknown, keys);
  check(
    "unknown claim linkage refuses UNKNOWN_CLAIM_LINKED",
    bad3.composition === null &&
      bad3.refusals.some((r) => r.code === "UNKNOWN_CLAIM_LINKED")
  );

  const good = JSON.stringify({
    openingIdentity: "Reference UB0134101B1U1 is the Breitling Chronomat B01 42.",
    sections: [
      {
        moduleId: "AT_A_GLANCE",
        heading: "At a Glance",
        paragraphs: [{ text: "Its case measures 42 mm in diameter.", claimIds: ["B01"] }],
      },
    ],
  });
  const ok = parseComposerOutput(good, keys);
  check("well-formed linked output parses", ok.composition !== null && ok.refusals.length === 0);
  check(
    "public shape strips claim linkage entirely",
    !JSON.stringify(toPublicSections(ok.composition.sections)).includes("claimIds")
  );
}

/* ── 3 · Claim-set basis freshness ────────────────────────────────────── */
console.log("── claim-set basis freshness ──────────────────────────────────");
{
  check("same hash is fresh", staleBasisRefusal("abc", "abc") === null);
  check("changed hash is stale", staleBasisRefusal("abc", "def") === "STALE_CLAIM_BASIS");
  check("missing current hash is stale", staleBasisRefusal("abc", null) === "STALE_CLAIM_BASIS");
}

/* ── 4 · Deterministic verification, claim-scoped ─────────────────────── */
console.log("── deterministic verification (paragraph/linked-claim scope) ──");
const sect = (moduleId, text, claimIds) => ({
  moduleId,
  heading: moduleId,
  paragraphs: [{ text, claimIds }],
});
{
  const clean = [
    sect("AT_A_GLANCE", "Its case measures 42.00 mm across, and the model was specified for 200 metres of water resistance. That figure describes the original model specification, not the present condition of an individual watch.", ["B01", "B02"]),
    sect("MOVEMENT", "The calibre runs at 28,800 vibrations per hour and offers approximately 70 hours of power reserve.", ["B04", "B05"]),
    sect("HISTORY", "Retailer documentation ties the Chronomat line to 1984.", ["B20"]),
  ];
  const refusals = deterministicFidelityCheck(clean, PACKET, IDENTITY);
  check(
    "clean control passes (incl. 42.00↔42 mm, metres↔m, hours↔hrs, 28,800)",
    refusals.length === 0,
    JSON.stringify(refusals)
  );

  const altered = [sect("AT_A_GLANCE", "Its case measures 44 mm across.", ["B01"])];
  const r1 = deterministicFidelityCheck(altered, PACKET, IDENTITY);
  check(
    "altered measurement caught (44 mm vs linked 42 mm)",
    r1.some((r) => r.code === "ALTERED_OR_ADDED_VALUE")
  );

  const foreign = [
    sect("CASE", "The case, shared with reference AB0134101B1A1, measures 42 mm.", ["B01"]),
  ];
  const r2 = deterministicFidelityCheck(foreign, PACKET, IDENTITY);
  check(
    "foreign reference identifier caught as REFERENCE_CONFLATION",
    r2.some((r) => r.code === "REFERENCE_CONFLATION")
  );

  /* The load-bearing scope proof: the sibling reference IS admitted in the
     packet (claim SIB), but this paragraph does not link SIB — global
     membership would pass it, linkage scope refuses it. */
  const sibling = [
    sect("CASE", "This configuration is documented as UB0134101B1A1 with the same case.", ["B01"]),
    sect("SIBLINGS", "A documented sibling configuration on a bracelet is reference UB0134101B1A1.", ["SIB"]),
  ];
  const r3 = deterministicFidelityCheck(sibling, PACKET, IDENTITY);
  check(
    "sibling value admitted globally but unlinked in this paragraph is caught",
    r3.some((r) => r.code === "REFERENCE_CONFLATION" && r.moduleId === "CASE")
  );
  check(
    "the same value in the paragraph that DOES link its claim passes",
    !r3.some((r) => r.moduleId === "SIBLINGS")
  );

  const noQualifier = [
    sect("AT_A_GLANCE", "The model is specified for 200 m of water resistance.", ["B02"]),
  ];
  const r4 = deterministicFidelityCheck(noQualifier, PACKET, IDENTITY);
  check(
    "dropped qualifier caught as OMITTED_QUALIFIER",
    r4.some((r) => r.code === "OMITTED_QUALIFIER")
  );

  const attributed = [
    sect("HISTORY", "Sotheby's identifies the Chronomat line with 1984.", ["B20"]),
  ];
  const r5 = deterministicFidelityCheck(attributed, PACKET, IDENTITY);
  check(
    "attribution absent from linked claims caught as ATTRIBUTION_DRIFT",
    r5.some((r) => r.code === "ATTRIBUTION_DRIFT")
  );

  const causal = [
    sect("DIAL", "Because the case measures 42 mm, the dial reads openly.", ["B01"]),
  ];
  const r6 = deterministicFidelityCheck(causal, PACKET, IDENTITY);
  check(
    "invented causal language caught deterministically",
    r6.some((r) => r.code === "UNSUPPORTED_CAUSALITY_LANGUAGE")
  );

  const signif = [
    sect("HISTORY", "The line, tied to 1984, has become highly sought-after.", ["B20"]),
  ];
  const r7 = deterministicFidelityCheck(signif, PACKET, IDENTITY);
  check(
    "unsupported significance language caught deterministically",
    r7.some((r) => r.code === "UNSUPPORTED_SIGNIFICANCE_LANGUAGE")
  );

  const chron = [
    sect("HISTORY", "The Chronomat line has run since 1984.", ["B20"]),
  ];
  const r8 = deterministicFidelityCheck(chron, PACKET, IDENTITY);
  check(
    "invented temporal relation caught deterministically",
    r8.some((r) => r.code === "UNSUPPORTED_CHRONOLOGY_LANGUAGE")
  );

  const opening = deterministicFidelityCheck(
    [],
    PACKET,
    IDENTITY,
    "Reference UB0134101B1U1 is the Breitling Chronomat B01 42, introduced with a 43 mm case."
  );
  check(
    "opening line carrying values beyond governed identity is caught",
    opening.some((r) => r.moduleId === "OPENING_IDENTITY")
  );

  const unknownLink = [sect("A", "Its case measures 42 mm.", ["B01", "GHOST"])];
  const r9 = deterministicFidelityCheck(unknownLink, PACKET, IDENTITY);
  check(
    "linkage to a claim outside the packet is caught",
    r9.some((r) => r.code === "UNKNOWN_CLAIM_LINKED")
  );
}

/* ── 5 · Pipeline behavior against an in-memory store ─────────────────── */
console.log("── pipeline behavior (in-memory store, scripted roles) ────────");

function makeStore(over = {}) {
  const state = {
    attempts: new Map(),
    patches: [],
    drafts: [],
    currentHash: "hash-frozen",
    nextId: 1,
  };
  const store = {
    state,
    async readIdentity() {
      return IDENTITY;
    },
    async readClaims() {
      return PACKET;
    },
    async readClaimSetHash() {
      return state.currentHash;
    },
    async readDomainUnits() {
      return [];
    },
    async insertAttempt(row) {
      const id = `attempt-${state.nextId++}`;
      state.attempts.set(id, { ...row, status: "composing" });
      return id;
    },
    async updateAttempt(id, patch) {
      state.patches.push({ id, patch });
      Object.assign(state.attempts.get(id), patch);
    },
    async saveDraftArticle(referenceId, draft) {
      state.drafts.push({ referenceId, ...draft, status: "draft" });
      return `article-${state.drafts.length}`;
    },
    ...over,
  };
  return store;
}

const CLEAN_COMPOSER_JSON = JSON.stringify({
  openingIdentity:
    "Reference UB0134101B1U1 is the Breitling Chronomat B01 42.",
  sections: [
    {
      moduleId: "AT_A_GLANCE",
      heading: "At a Glance",
      paragraphs: [
        {
          text: "Its case measures 42 mm in diameter, and the model was specified for 200 m of water resistance — a figure that describes the original model specification, not the present condition of an individual watch.",
          claimIds: ["B01", "B02"],
        },
      ],
    },
    {
      moduleId: "MOVEMENT",
      heading: "Movement",
      paragraphs: [
        {
          text: "The calibre runs at 28,800 vibrations per hour and offers approximately 70 hours of power reserve.",
          claimIds: ["B04", "B05"],
        },
      ],
    },
  ],
});

const roleScript = (composerText, verifierText) => {
  const calls = [];
  const caller = async (role) => {
    calls.push(role);
    if (role === "dossier_composer") {
      if (composerText instanceof Error) throw composerText;
      return { text: composerText, provider: "test", model: "test-model", usage: { inputTokens: 1, outputTokens: 1 }, stopReason: "end_turn" };
    }
    if (verifierText instanceof Error) throw verifierText;
    return { text: verifierText, provider: "test", model: "test-model", usage: { inputTokens: 1, outputTokens: 1 }, stopReason: "end_turn" };
  };
  caller.calls = calls;
  return caller;
};

{
  // Verified path.
  const store = makeStore();
  const callRole = roleScript(CLEAN_COMPOSER_JSON, JSON.stringify({ refusals: [] }));
  const result = await runCompositionAttempt({ store, callRole }, "ref-1");
  check("clean attempt reaches verified", result.status === "verified", result.detail ?? "");
  check("verified attempt persists a draft article", store.state.drafts.length === 1);
  check(
    "the draft is status draft, never approved",
    store.state.drafts.every((d) => d.status === "draft")
  );
  check(
    "draft source note carries attempt id and frozen claim-set hash",
    store.state.drafts[0]?.sourceNote.includes(result.attemptId) &&
      store.state.drafts[0]?.sourceNote.includes("hash-frozen")
  );
  check(
    "candidate sections carry no claim ids or provider metadata keys",
    !JSON.stringify(store.state.drafts[0]?.sections).match(
      /"claimIds"|"provider"|"composerModel"|"usage"/
    )
  );
  check(
    "candidate hash is self-verifying",
    result.candidateSha256 ===
      candidateSha256(
        `${IDENTITY.brand} ${IDENTITY.model} · Reference ${IDENTITY.reference}`,
        result.openingIdentity,
        result.candidateSections
      )
  );

  // Composer failure.
  const s2 = makeStore();
  const c2 = roleScript(new Error("composer down"), JSON.stringify({ refusals: [] }));
  const r2 = await runCompositionAttempt({ store: s2, callRole: c2 }, "ref-1");
  check("composer failure records composer_unavailable", r2.status === "composer_unavailable");
  check("composer failure publishes nothing", s2.state.drafts.length === 0);
  check("composer failure never calls the verifier", !c2.calls.includes("dossier_verifier"));

  // Deterministic drift: composer output smuggles an unsupported value.
  const drifted = JSON.parse(CLEAN_COMPOSER_JSON);
  drifted.sections[0].paragraphs[0].text = drifted.sections[0].paragraphs[0].text.replace("42 mm", "44 mm");
  const s3 = makeStore();
  const c3 = roleScript(JSON.stringify(drifted), JSON.stringify({ refusals: [] }));
  const r3 = await runCompositionAttempt({ store: s3, callRole: c3 }, "ref-1");
  check("mechanical drift refuses deterministically", r3.status === "deterministic_refused");
  check(
    "deterministic refusal stops before spending the semantic call",
    !c3.calls.includes("dossier_verifier")
  );
  check("deterministic refusal publishes nothing", s3.state.drafts.length === 0);
  check(
    "named deterministic refusals are persisted",
    s3.state.patches.some(
      (p) => (p.patch.deterministicRefusals ?? []).length > 0
    )
  );

  // Semantic refusal.
  const s4 = makeStore();
  const c4 = roleScript(
    CLEAN_COMPOSER_JSON,
    JSON.stringify({
      refusals: [
        { code: "INVENTED_CAUSALITY", moduleId: "MOVEMENT", paragraphIndex: 0, quote: "x", why: "y" },
      ],
    })
  );
  const r4 = await runCompositionAttempt({ store: s4, callRole: c4 }, "ref-1");
  check("semantic refusal records semantic_refused", r4.status === "semantic_refused");
  check("semantic refusal publishes nothing", s4.state.drafts.length === 0);

  // Verifier outage.
  const s5 = makeStore();
  const c5 = roleScript(CLEAN_COMPOSER_JSON, new Error("verifier down"));
  const r5 = await runCompositionAttempt({ store: s5, callRole: c5 }, "ref-1");
  check("verifier outage records verifier_unavailable", r5.status === "verifier_unavailable");
  check("verifier outage publishes nothing — draft stays unverified", s5.state.drafts.length === 0);

  // Verifier verdict outside the vocabulary is unusable, not trusted.
  const s6 = makeStore();
  const c6 = roleScript(
    CLEAN_COMPOSER_JSON,
    JSON.stringify({ refusals: [{ code: "LOW_CONFIDENCE", quote: "", why: "" }] })
  );
  const r6 = await runCompositionAttempt({ store: s6, callRole: c6 }, "ref-1");
  check(
    "verdict outside the named vocabulary is refused as unusable",
    r6.status === "verifier_unavailable" && s6.state.drafts.length === 0
  );

  // Stale basis: hash changes between freeze and verified persistence.
  const s7 = makeStore();
  let reads = 0;
  s7.readClaimSetHash = async () => (reads++ === 0 ? "hash-frozen" : "hash-moved");
  const c7 = roleScript(CLEAN_COMPOSER_JSON, JSON.stringify({ refusals: [] }));
  const r7 = await runCompositionAttempt({ store: s7, callRole: c7 }, "ref-1");
  check("basis change during the attempt refuses stale_claim_basis", r7.status === "stale_claim_basis");
  check("stale basis publishes nothing", s7.state.drafts.length === 0);

  // Empty composable set.
  const s8 = makeStore();
  s8.readClaims = async () =>
    PACKET.map((c) => ({ ...c, evidenceBinding: "UNBOUND" }));
  const r8 = await runCompositionAttempt(
    { store: s8, callRole: roleScript(CLEAN_COMPOSER_JSON, "{}") },
    "ref-1"
  );
  check(
    "no composable claims refuses before any model call",
    r8.status === "no_composable_claims" && r8.attemptId === null
  );
}

/* ── 6 · Structural floor: no approval door, no listing coupling ──────── */
console.log("── structural floor in the shipped source ─────────────────────");
{
  const src = (p) => readFileSync(join(here, "..", p), "utf8");
  const pipeline = src("lib/dossier/compositionPipeline.ts");
  const composition = src("lib/dossier/composition.ts");
  const verification = src("lib/dossier/fidelityVerification.ts");
  const roles = src("lib/dossier/providerRoles.ts");
  const all = pipeline + composition + verification + roles;

  check(
    "composition machinery never invokes the founder approval RPC",
    !all.includes("collector_dossier_article_approve")
  );
  check(
    "composition machinery never sets an article to approved",
    !/status['"]?\s*[:=]\s*['"]approved['"]/.test(all)
  );
  check(
    "composition machinery has no listing-table coupling",
    !/from\(\s*['"]listings['"]/.test(all) && !/listing_decision/.test(all)
  );
  check(
    "no confidence field anywhere in the composition layer",
    // Code patterns only — a prompt SAYING "do not express confidence" is
    // the law being stated, not a field being declared.
    !/confidence\s*[:=]/i.test(all) && !/["']confidence["']/i.test(all)
  );
  check(
    "migration keeps the attempts table server-only (all three roles revoked)",
    /revoke all on public\.collector_dossier_composition_attempts from public, anon, authenticated/.test(
      src("supabase/migrations/20260813210000_collector_dossier_composition_attempts.sql")
    )
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
