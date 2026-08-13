/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — DOMAIN KNOWLEDGE BEHAVIOR TESTS

   Run: node scripts/dossier-domain-knowledge.test.mjs

   No network, no DB, no model. Proves the shelf's admission contracts
   refuse what they must, applicability is deterministic, the composer
   sees only the applicable intersection, and typed dual linkage flows
   through parse → deterministic verification → public stripping.
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const { domainAdmissionFor, domainRefusals, applicableDomainUnits } =
  await import("../lib/dossier/domainKnowledge.ts");
const { parseComposerOutput, toPublicSections } = await import(
  "../lib/dossier/composition.ts"
);
const { deterministicFidelityCheck } = await import(
  "../lib/dossier/fidelityVerification.ts"
);
const { runCompositionAttempt } = await import(
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

/* ── Fixtures ─────────────────────────────────────────────────────────── */
const RETRIEVAL = {
  id: "ret-1",
  requestedUrl: "https://specialist.example-technical.net/beat-rates",
  resolvedUrl: null,
  host: "specialist.example-technical.net",
  httpStatus: 200,
  contentSha256: "a".repeat(64),
  text: "A movement at 28,800 vibrations per hour beats eight times per second. Power reserve and friction and jewels and chronometer testing and rider tabs since 1984.",
  lifecycle: "current",
};
const CTX = { retrievals: [RETRIEVAL] };

const evidence = (over = {}) => ({
  sourceClass: "SPECIALIST_TECHNICAL",
  sourceName: "Specialist technical archive",
  sourceUrl: "https://specialist.example-technical.net/beat-rates",
  sourceExcerpt: "beats eight times per second",
  sourceAccessed: "2026-08-13",
  retrievalId: "ret-1",
  retrievalSha256: "a".repeat(64),
  ...over,
});

const unit = (over = {}) => ({
  knowledgeKey: "beat_rate_28800",
  knowledgeClass: "GENERAL_HOROLOGY",
  conceptKey: "beat_rate",
  outcome: "VERIFIED",
  statement:
    "A movement at 28,800 vibrations per hour beats eight times each second, so the seconds hand reads as a near-continuous sweep.",
  values: ["28,800"],
  qualifier: null,
  evidence: [evidence()],
  applicability: [{ kind: "value_match", anyOf: ["28,800"] }],
  ...over,
});

/* ── 1 · Admission contracts refuse what they must ────────────────────── */
console.log("── domain admission contracts ─────────────────────────────────");
{
  check("clean general-horology unit admits", domainAdmissionFor(unit(), CTX).admission === "ADMITTED",
    domainRefusals(unit(), CTX).join(","));

  const contaminated = unit({
    statement: "Reference UB0134101B1U1 beats at 28,800 vibrations per hour.",
  });
  check(
    "reference identifier in a domain statement refuses (cannot masquerade as a reference claim)",
    domainRefusals(contaminated, CTX).includes("DOMAIN_REFERENCE_CONTAMINATION")
  );

  const noRules = unit({ applicability: [] });
  check(
    "missing applicability refuses",
    domainRefusals(noRules, CTX).includes("DOMAIN_APPLICABILITY_MISSING")
  );

  const unretrieved = unit({ evidence: [evidence({ retrievalId: null, retrievalSha256: null })] });
  check(
    "an unretrieved source refuses — no weaker path for general knowledge",
    domainRefusals(unretrieved, CTX).includes("SOURCE_NOT_RETRIEVED")
  );

  const singleRetailerHistory = unit({
    knowledgeKey: "rider_tabs_origin",
    knowledgeClass: "FEATURE_DESIGN_HISTORY",
    conceptKey: "rider_tabs",
    statement: "Rider tabs appeared on the 1984 Chronomat as grip points on the rotating bezel.",
    values: ["1984"],
    evidence: [evidence({ sourceClass: "DEALER_ARCHIVE", sourceExcerpt: "rider tabs since 1984" })],
  });
  const historyRefusals = domainRefusals(singleRetailerHistory, CTX);
  check(
    "feature history from a single retailer refuses",
    historyRefusals.includes("INSUFFICIENT_CORROBORATION") &&
      historyRefusals.includes("DOMAIN_AUTHORITY_INSUFFICIENT")
  );

  const certNoBody = unit({
    knowledgeKey: "cosc_certification",
    knowledgeClass: "CERTIFICATION_STANDARD_CONTEXT",
    conceptKey: "cosc",
    statement: "A chronometer certificate attests tested precision of a movement.",
    values: [],
    evidence: [evidence({ sourceExcerpt: "chronometer testing" })],
  });
  check(
    "certification context without the certifying body or corroborated manufacturer refuses",
    domainRefusals(certNoBody, CTX).includes("DOMAIN_AUTHORITY_INSUFFICIENT")
  );

  const vibes = unit({
    statement: "A 28,800 vph movement is highly regarded and makes a watch a sought-after investment.",
  });
  check(
    "significance/market language refuses in every class — the shelf is not vibes",
    domainRefusals(vibes, CTX).includes("UNSUPPORTED_SIGNIFICANCE")
  );

  const intentGeneral = unit({
    statement: "The escapement is designed to impress collectors at 28,800 vibrations per hour.",
  });
  check(
    "intent language refuses in a technical class",
    domainRefusals(intentGeneral, CTX).includes("UNSUPPORTED_INTENT")
  );

  const chronoGeneral = unit({
    statement: "Since 1984 movements have beaten at 28,800 vibrations per hour.",
  });
  check(
    "chronology refuses in a technical class (history belongs to the history classes)",
    domainRefusals(chronoGeneral, CTX).includes("UNSUPPORTED_CHRONOLOGY")
  );

  const pending = unit({ outcome: "UNRESOLVED" });
  check(
    "an unresolved finding holds as PENDING_REVIEW, never admits",
    domainAdmissionFor(pending, CTX).admission === "PENDING_REVIEW"
  );
}

/* ── 2 · Applicability is deterministic and load-bearing ──────────────── */
console.log("── applicability (the composer sees only the intersection) ────");
const IDENTITY = {
  brand: "Breitling",
  collection: "Chronomat",
  model: "Chronomat B01 42",
  reference: "UB0134101B1U1",
};
const refClaim = (over = {}) => ({
  claimKey: "B05",
  claimClass: "OBJECTIVE_FACT",
  admission: "ADMITTED",
  evidenceBinding: "RETRIEVAL_BOUND",
  subject: "movement.frequency",
  statement: "The calibre runs at 28,800 vibrations per hour.",
  values: ["28,800"],
  qualifier: null,
  supports: [],
  moduleHint: null,
  ...over,
});
const shelfUnit = (over = {}) => ({
  id: "dk-1",
  knowledgeKey: "beat_rate_28800",
  knowledgeClass: "GENERAL_HOROLOGY",
  conceptKey: "beat_rate",
  admission: "ADMITTED",
  evidenceBinding: "RETRIEVAL_BOUND",
  statement: "A movement at 28,800 vibrations per hour beats eight times each second.",
  values: ["28,800"],
  qualifier: null,
  applicability: [{ kind: "value_match", anyOf: ["28,800"] }],
  ...over,
});
{
  const claims = [refClaim()];
  check(
    "value_match joins on a governed claim value",
    applicableDomainUnits([shelfUnit()], claims, IDENTITY).length === 1
  );
  check(
    "value_match refuses when no claim carries the value",
    applicableDomainUnits(
      [shelfUnit()],
      [refClaim({ values: ["21,600"], statement: "The calibre runs at 21,600 vibrations per hour." })],
      IDENTITY
    ).length === 0
  );
  check(
    "subject_match joins on the claim subject",
    applicableDomainUnits(
      [shelfUnit({ id: "dk-2", knowledgeKey: "u2", applicability: [{ kind: "subject_match", subjects: ["movement.frequency"] }] })],
      claims,
      IDENTITY
    ).length === 1
  );
  check(
    "statement_term joins on governed statement text",
    applicableDomainUnits(
      [shelfUnit({ id: "dk-3", knowledgeKey: "u3", applicability: [{ kind: "statement_term", terms: ["vibrations per hour"] }] })],
      claims,
      IDENTITY
    ).length === 1
  );
  check(
    "line_identity joins on governed identity, not prose",
    applicableDomainUnits(
      [shelfUnit({ id: "dk-4", knowledgeKey: "u4", applicability: [{ kind: "line_identity", line: "Chronomat" }] })],
      claims,
      IDENTITY
    ).length === 1
  );
  check(
    "line_identity refuses a foreign line",
    applicableDomainUnits(
      [shelfUnit({ id: "dk-5", knowledgeKey: "u5", applicability: [{ kind: "line_identity", line: "Navitimer" }] })],
      claims,
      IDENTITY
    ).length === 0
  );
  check(
    "a REFUSED unit never reaches the composer",
    applicableDomainUnits([shelfUnit({ admission: "REFUSED" })], claims, IDENTITY).length === 0
  );
  check(
    "a PENDING_REVIEW unit never reaches the composer",
    applicableDomainUnits([shelfUnit({ admission: "PENDING_REVIEW" })], claims, IDENTITY).length === 0
  );
  check(
    "an UNBOUND unit never reaches the composer",
    applicableDomainUnits([shelfUnit({ evidenceBinding: "UNBOUND" })], claims, IDENTITY).length === 0
  );
}

/* ── 3 · Typed dual linkage through parse and verification ────────────── */
console.log("── typed dual linkage ─────────────────────────────────────────");
{
  const claimKeys = ["B05"];
  const domainKeys = ["beat_rate_28800"];

  const domainOnly = JSON.stringify({
    openingIdentity: "Reference UB0134101B1U1 is the Breitling Chronomat B01 42.",
    sections: [
      {
        moduleId: "CRAFT",
        heading: "The Beat",
        paragraphs: [
          { text: "Eight beats a second turns stepping into sweep.", claimIds: [], domainIds: ["beat_rate_28800"] },
        ],
      },
    ],
  });
  const ok = parseComposerOutput(domainOnly, claimKeys, domainKeys);
  check("a paragraph may be licensed by domain knowledge alone", ok.composition !== null);

  const unknownDomain = JSON.stringify({
    openingIdentity: "Reference UB0134101B1U1.",
    sections: [
      {
        moduleId: "CRAFT",
        heading: "The Beat",
        paragraphs: [{ text: "Some craft prose.", domainIds: ["not_on_the_shelf"] }],
      },
    ],
  });
  const bad = parseComposerOutput(unknownDomain, claimKeys, domainKeys);
  check(
    "linking a unit outside the applicable shelf refuses UNKNOWN_DOMAIN_LINKED",
    bad.composition === null && bad.refusals.some((r) => r.code === "UNKNOWN_DOMAIN_LINKED")
  );

  const noLinkage = JSON.stringify({
    openingIdentity: "Reference UB0134101B1U1.",
    sections: [
      {
        moduleId: "CRAFT",
        heading: "The Beat",
        paragraphs: [{ text: "Unlinked prose.", claimIds: [], domainIds: [] }],
      },
    ],
  });
  const bad2 = parseComposerOutput(noLinkage, claimKeys, domainKeys);
  check(
    "a paragraph with neither claims nor domain units refuses",
    bad2.composition === null &&
      bad2.refusals.some((r) => r.code === "PARAGRAPH_WITHOUT_CLAIM_LINKAGE")
  );

  // Deterministic verification across both corpora.
  const claims = [refClaim()];
  const units = [shelfUnit()];
  const sections = [
    {
      moduleId: "CRAFT",
      heading: "The Beat",
      paragraphs: [
        {
          text: "At 28,800 vibrations per hour the calibre beats eight times each second, so the hand reads as sweep.",
          claimIds: ["B05"],
          domainIds: ["beat_rate_28800"],
        },
      ],
    },
  ];
  const clean = deterministicFidelityCheck(sections, claims, IDENTITY, undefined, units);
  check("a paragraph inside its dual linked material passes", clean.length === 0, JSON.stringify(clean));

  const unlinkedValue = [
    {
      moduleId: "CRAFT",
      heading: "The Beat",
      paragraphs: [
        {
          // 28,800 appears but NEITHER linked corpus item is attached.
          text: "At 28,800 vibrations per hour the hand reads as sweep.",
          claimIds: [],
          domainIds: ["some_other_unit"],
        },
      ],
    },
  ];
  const caught = deterministicFidelityCheck(unlinkedValue, claims, IDENTITY, undefined, units);
  check(
    "a mechanical value with no linked licence is caught (and the ghost link named)",
    caught.some((r) => r.code === "ALTERED_OR_ADDED_VALUE") &&
      caught.some((r) => r.code === "UNKNOWN_DOMAIN_LINKED")
  );

  check(
    "public sections strip both id lists",
    !JSON.stringify(toPublicSections(sections)).match(/"claimIds"|"domainIds"/)
  );
}

/* ── 4 · Pipeline: intersection only, and domain staleness refuses ────── */
console.log("── pipeline behavior with the shelf ───────────────────────────");
{
  const makeStore = (over = {}) => {
    const state = { drafts: [], attempts: new Map(), n: 0, composerSawDomain: null };
    return {
      state,
      async readIdentity() { return IDENTITY; },
      async readClaims() { return [refClaim()]; },
      async readClaimSetHash() { return "hash-frozen"; },
      async readDomainUnits() {
        return [
          shelfUnit(),
          shelfUnit({ id: "dk-x", knowledgeKey: "navitimer_only", applicability: [{ kind: "line_identity", line: "Navitimer" }] }),
          shelfUnit({ id: "dk-r", knowledgeKey: "refused_unit", admission: "REFUSED" }),
        ];
      },
      async insertAttempt(row) {
        const id = `a-${++state.n}`;
        state.attempts.set(id, row);
        return id;
      },
      async updateAttempt(id, patch) { Object.assign(state.attempts.get(id), patch); },
      async saveDraftArticle(_ref, draft) { state.drafts.push(draft); return "art-1"; },
      ...over,
    };
  };

  const CLEAN = JSON.stringify({
    openingIdentity: "Reference UB0134101B1U1 is the Breitling Chronomat B01 42.",
    sections: [
      {
        moduleId: "MOVEMENT",
        heading: "The Beat",
        paragraphs: [
          {
            text: "The calibre runs at 28,800 vibrations per hour — eight beats each second, so the hand reads as sweep.",
            claimIds: ["B05"],
            domainIds: ["beat_rate_28800"],
          },
        ],
      },
    ],
  });
  const roles = (composerText, verifierText) => {
    const calls = [];
    const fn = async (role, req) => {
      calls.push({ role, req });
      if (role === "dossier_composer") {
        return { text: composerText, provider: "test", model: "t", usage: { inputTokens: 1, outputTokens: 1 }, stopReason: "end_turn" };
      }
      return { text: verifierText, provider: "test", model: "t", usage: { inputTokens: 1, outputTokens: 1 }, stopReason: "end_turn" };
    };
    fn.calls = calls;
    return fn;
  };

  const s1 = makeStore();
  const c1 = roles(CLEAN, JSON.stringify({ refusals: [] }));
  const r1 = await runCompositionAttempt({ store: s1, callRole: c1 }, "ref-1");
  check("dual-linked clean attempt verifies", r1.status === "verified", r1.detail ?? "");
  check(
    "attempt records the applicable domain basis",
    (s1.state.attempts.get(r1.attemptId)?.inputDomainKeys ?? []).includes("beat_rate_28800")
  );
  const composerPrompt = c1.calls.find((c) => c.role === "dossier_composer")?.req.user ?? "";
  check(
    "the composer sees the applicable unit",
    composerPrompt.includes("beat_rate_28800")
  );
  check(
    "the composer never sees inapplicable or refused shelf contents",
    !composerPrompt.includes("navitimer_only") && !composerPrompt.includes("refused_unit")
  );

  // Domain staleness: the used unit is superseded mid-attempt.
  const s2 = makeStore();
  let shelfReads = 0;
  s2.readDomainUnits = async () => {
    shelfReads += 1;
    return shelfReads === 1
      ? [shelfUnit()]
      : [shelfUnit({ id: "dk-1-v2" })]; // same key, NEW id — a versioned correction
  };
  const r2 = await runCompositionAttempt(
    { store: s2, callRole: roles(CLEAN, JSON.stringify({ refusals: [] })) },
    "ref-1"
  );
  check(
    "a domain unit superseded during the attempt refuses stale_claim_basis",
    r2.status === "stale_claim_basis" && s2.state.drafts.length === 0
  );
}

/* ── 5 · Structural floor ─────────────────────────────────────────────── */
console.log("── structural floor ───────────────────────────────────────────");
{
  const src = (p) => readFileSync(join(here, "..", p), "utf8");
  const domainSrc = src("lib/dossier/domainKnowledge.ts");
  const migration = src("supabase/migrations/20260813233000_collector_dossier_domain_knowledge.sql");

  check(
    "the shelf table declares no vault_reference_id column — scope separation is structural",
    // Column-declaration pattern only; the header comment legitimately
    // NAMES the absence, and prose must never trip a code scan.
    !/^\s*vault_reference_id\s+uuid/m.test(migration)
  );
  check(
    "shelf table is server-only (all three roles revoked)",
    /revoke all on public\.collector_dossier_domain_knowledge from public, anon, authenticated/.test(migration)
  );
  check(
    "no confidence field in the domain layer",
    !/confidence\s*[:=]/i.test(domainSrc) && !/["']confidence["']/i.test(domainSrc)
  );
  check(
    "domain layer never touches the approval RPC or listings",
    !domainSrc.includes("collector_dossier_article_approve") && !/from\(\s*['"]listings['"]/.test(domainSrc)
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
