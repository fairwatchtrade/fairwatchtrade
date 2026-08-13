/* Collector Dossier claims corpus — admission behaviour.
   Run: node scripts/dossier-claims-corpus.test.mjs

   These test what the corpus ADMITS AND REFUSES, not that a table exists.
   Every case is a named deterministic condition; nothing here scores. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const mod = await import("../lib/dossier/claimAdmission.ts");
const {
  CLAIM_CLASSES, RESEARCH_OUTCOMES, ADMISSION_STATES, REFUSAL_CODES,
  admissionFor, claimRefusals, claimSetHashInput, normalizeForComparison,
} = mod;

let n = 0;
const ok = (name, cond) => {
  assert.ok(cond, name);
  console.log(`  PASS ${++n}  ${name}`);
};

const REF = "5967BB/11/9W6";

/* Retrieval-bound evidence (2026-08-13): a source object no longer proves
   anything on its own, so these fixtures cite a retrieval whose text
   actually carries what the claims assert. */
const RETRIEVAL = {
  id: "ret-test",
  requestedUrl: "https://monochrome-watches.com/breguet-classique-5967",
  resolvedUrl: "https://monochrome-watches.com/breguet-classique-5967",
  host: "monochrome-watches.com",
  httpStatus: 200,
  contentSha256: "c".repeat(64),
  text: "The case measures 41 mm in diameter. Breguet introduced the Classique 5967 in 2009. The dial is individually numbered and hand-guilloche.",
  lifecycle: "current",
};
const RETRIEVAL_B = {
  ...RETRIEVAL, id: "ret-test-b",
  requestedUrl: "https://phillips.com/lot/12",
  resolvedUrl: "https://phillips.com/lot/12",
  host: "phillips.com",
};
const ctx = (admittedKeys = []) => ({
  referenceText: REF, admittedKeys, retrievals: [RETRIEVAL, RETRIEVAL_B],
});

const goodEvidence = (over = {}) => [{
  sourceClass: "SPECIALIST_TECHNICAL",
  sourceName: "Breguet Classique 5967 technical review",
  sourceUrl: "https://monochrome-watches.com/breguet-classique-5967",
  sourceExcerpt: "The case measures 41 mm in diameter.",
  sourceAccessed: "2026-08-13",
  retrievalId: "ret-test",
  retrievalSha256: "c".repeat(64),
  ...over,
}];

const fact = (over = {}) => ({
  claimKey: "C02", claimClass: "OBJECTIVE_FACT", outcome: "VERIFIED",
  subject: "case.diameter_mm", statement: "The case measures 41 mm in diameter.",
  values: ["41 mm"], evidence: goodEvidence(), ...over,
});

/* ── Vocabulary is closed and carries no confidence authority ─────────── */
ok("three claim classes, no more", CLAIM_CLASSES.length === 3 &&
  CLAIM_CLASSES.includes("OBJECTIVE_FACT") && CLAIM_CLASSES.includes("CONTEXTUAL_FACT") &&
  CLAIM_CLASSES.includes("DESIGN_DESCRIPTION"));
ok("the research trichotomy is reused verbatim",
  RESEARCH_OUTCOMES.join(",") === "VERIFIED,UNRESOLVED,UNSUPPORTED");
ok("admission is a separate three-state vocabulary",
  ADMISSION_STATES.join(",") === "ADMITTED,REFUSED,PENDING_REVIEW");
{
  const src = read("lib/dossier/claimAdmission.ts");
  const sql = read("supabase/migrations/20260813170000_collector_dossier_claims.sql");
  const corpus = read("lib/dossier/claimsCorpus.ts");
  ok("no confidence field anywhere in the corpus layer",
    !/confidence/i.test(src.replace(/THERE IS NO CONFIDENCE FIELD[^\n]*/i, "")) === false
      ? !/\bconfidence\s*[:=]/i.test(src) && !/confidence/i.test(sql.replace(/NO CONFIDENCE COLUMN[^\n]*/i, "")) && !/confidence/i.test(corpus)
      : true);
  ok("no client role can reach the corpus",
    /revoke all on public\.collector_dossier_claims from public, anon, authenticated/.test(sql));
  // Coupling means CODE reaching listings, not a comment naming them.
  ok("the corpus never couples to listing publication",
    !/\.from\("listings"\)/.test(corpus) &&
    !/ensureCollectorDossier|listing_id/.test(corpus) &&
    !/public\.listings/.test(sql));
}

/* ── Objective fact: auto-admission and its refusals ──────────────────── */
ok("a well-sourced objective fact auto-admits",
  admissionFor(fact(), ctx()).admission === "ADMITTED");

// The v4.45 contract proved source SHAPE. Since retrieval binding, shape
// alone is no longer sufficient for any class — a perfectly formed source
// object that was never fetched refuses.
ok("shape alone no longer admits anything: an unretrieved source refuses",
  admissionFor(fact({ evidence: goodEvidence({ retrievalId: null }) }), ctx()).admission === "REFUSED");

ok("an uncited claim is never accepted, however plausible",
  claimRefusals(fact({ evidence: [] }), ctx()).includes("MISSING_EVIDENCE"));

ok("placeholder source host refused",
  claimRefusals(fact({ evidence: goodEvidence({ sourceUrl: "https://example.com/x" }) }), ctx())
    .includes("PLACEHOLDER_SOURCE"));

ok("prose standing in for a source refused",
  claimRefusals(fact({ evidence: goodEvidence({ sourceName: "Verified Independent Source" }) }), ctx())
    .includes("PROSE_AS_SOURCE"));

ok("non-ISO accessed date refused",
  claimRefusals(fact({ evidence: goodEvidence({ sourceAccessed: "13/08/2026" }) }), ctx())
    .includes("INVALID_DATE"));

ok("a source class this claim class does not accept is refused",
  claimRefusals(fact({ evidence: goodEvidence({ sourceClass: "SPECIALIST_OBSERVATION" }) }), ctx())
    .includes("UNSUPPORTED_SOURCE_CLASS"));

ok("an objective fact naming a foreign reference is refused as contamination",
  claimRefusals(
    fact({ statement: "The 5967BA/11/9W6 case measures 41 mm in diameter." }), ctx()
  ).includes("SIBLING_REFERENCE_CONTAMINATION"));

/* ── UNRESOLVED and UNSUPPORTED stay meaningful ───────────────────────── */
{
  const unresolved = fact({
    claimKey: "C03", outcome: "UNRESOLVED",
    statement: "Reported case thickness differs between source classes.",
    values: [], options: [
      { value: "6.95 mm", evidence: "specialist records" },
      { value: "7 mm", evidence: "dealer archives" },
    ],
  });
  const v = admissionFor(unresolved, ctx());
  ok("UNRESOLVED is held for review, never admitted, never averaged",
    v.admission === "PENDING_REVIEW" && v.refusals.includes("OUTCOME_NOT_VERIFIED") &&
    unresolved.options.length === 2);

  const unsupported = admissionFor(fact({ claimKey: "C27", outcome: "UNSUPPORTED" }), ctx());
  ok("UNSUPPORTED persists durably and is never admitted",
    unsupported.admission === "PENDING_REVIEW" &&
    unsupported.refusals.includes("OUTCOME_NOT_VERIFIED"));
}

/* ── Contextual fact: stronger support, explicit corroboration ────────── */
{
  const contextual = (over = {}) => ({
    claimKey: "C25", claimClass: "CONTEXTUAL_FACT", outcome: "VERIFIED",
    subject: "history.introduced", statement: "Breguet introduced the Classique 5967 in 2009.",
    values: ["2009"], evidence: goodEvidence({ sourceClass: "MANUFACTURER_SPEC" }), ...over,
  });
  ok("a primary authority alone carries a contextual fact",
    admissionFor(contextual(), ctx()).admission === "ADMITTED");

  ok("a non-primary source alone is refused for insufficient corroboration",
    claimRefusals(contextual({ evidence: goodEvidence({ sourceClass: "DEALER_ARCHIVE" }) }), ctx())
      .includes("INSUFFICIENT_CORROBORATION"));

  const twoHosts = [
    ...goodEvidence({ sourceClass: "DEALER_ARCHIVE" }),
    ...goodEvidence({
      sourceClass: "AUCTION_RECORD",
      sourceUrl: "https://phillips.com/lot/12",
      retrievalId: "ret-test-b",
    }),
  ];
  ok("two independent source hosts satisfy corroboration",
    admissionFor(contextual({ evidence: twoHosts }), ctx()).admission === "ADMITTED");

  ok("the same host twice is not corroboration",
    claimRefusals(contextual({
      evidence: [
        ...goodEvidence({ sourceClass: "DEALER_ARCHIVE" }),
        ...goodEvidence({ sourceClass: "DEALER_ARCHIVE", sourceUrl: "https://monochrome-watches.com/other" }),
      ],
    }), ctx()).includes("INSUFFICIENT_CORROBORATION"));

  ok("a contextual claim MAY name an adjacent reference — documenting the relationship is its job",
    admissionFor(contextual({
      claimKey: "C20",
      statement: "A documented 18K yellow-gold sibling is reference 5967BA/11/9W6.",
      evidence: goodEvidence({ sourceClass: "AUCTION_HOUSE" }),
    }), ctx()).admission === "ADMITTED");
}

/* ── Design description: bounded observation, and its hard edges ──────── */
{
  const design = (over = {}) => ({
    claimKey: "D01", claimClass: "DESIGN_DESCRIPTION", outcome: "VERIFIED",
    subject: "dial.reading_order",
    statement: "The Roman chapter and blued hands form a distinct reading layer above the geometry.",
    values: [], supports: ["C10"],
    evidence: goodEvidence({ sourceClass: "SPECIALIST_OBSERVATION" }), ...over,
  });

  ok("a bounded observation resting on an admitted fact is admitted",
    admissionFor(design(), ctx(["C10"])).admission === "ADMITTED");

  ok("an observation resting on nothing admitted is refused",
    claimRefusals(design(), ctx([])).includes("UNLINKED_OBSERVATION"));

  ok("an observation resting on a refused claim is refused",
    claimRefusals(design({ supports: ["C99"] }), ctx(["C10"])).includes("UNLINKED_OBSERVATION"));

  ok("observation may not explain WHY",
    claimRefusals(design({
      statement: "The layout leaves a broad field because Breguet wanted the guilloché to carry it.",
    }), ctx(["C10"])).includes("UNSUPPORTED_CAUSALITY"));

  ok("observation may not assert designer intent",
    claimRefusals(design({
      statement: "The dial was designed to showcase the guilloché.",
    }), ctx(["C10"])).includes("UNSUPPORTED_INTENT"));

  ok("observation may not rank importance or desirability",
    claimRefusals(design({
      statement: "The dial is among the most sought-after in the collection.",
    }), ctx(["C10"])).includes("UNSUPPORTED_SIGNIFICANCE"));

  ok("observation may not place the reference in time",
    claimRefusals(design({
      statement: "The pattern was revived more than two centuries later.",
    }), ctx(["C10"])).includes("UNSUPPORTED_CHRONOLOGY"));

  ok("observation may not attribute a statement to a source",
    claimRefusals(design({
      statement: "According to the catalogue, the dial reads in layers.",
    }), ctx(["C10"])).includes("UNSUPPORTED_ATTRIBUTION"));

  ok("observation may not smuggle a sibling reference",
    claimRefusals(design({
      statement: "The 5967BA/11/9W6 dial reads in layers.",
    }), ctx(["C10"])).includes("SIBLING_REFERENCE_CONTAMINATION"));
}

/* ── Claim-set hash: stable, and moves on material change ─────────────── */
{
  const set = [
    { claimKey: "C02", claimClass: "OBJECTIVE_FACT", statement: "41 mm.", values: ["41 mm"], qualifier: null },
    { claimKey: "C13", claimClass: "OBJECTIVE_FACT", statement: "Calibre 506.2.", values: ["506.2"], qualifier: null },
  ];
  const a = claimSetHashInput(set);
  const reordered = claimSetHashInput([...set].reverse());
  ok("hash input is order-independent — a reread is byte-stable", a === reordered);

  ok("hash input changes when an admitted value materially changes",
    a !== claimSetHashInput([{ ...set[0], values: ["42 mm"] }, set[1]]));
  ok("hash input changes when a required qualifier changes",
    a !== claimSetHashInput([{ ...set[0], qualifier: "check on the subject watch" }, set[1]]));
  ok("hash input ignores runtime noise it was never given",
    claimSetHashInput(set.map((c) => ({ ...c }))) === a);
}

/* ── Typographic normalisation contract ───────────────────────────────── */
{
  const curly = "the number’s exact placement — checked";
  const straight = "the number's exact placement - checked";
  ok("comparison folds curly quotes and dashes (the replay's false-positive trap)",
    normalizeForComparison(curly) === normalizeForComparison(straight));
  ok("normalisation is comparison-only and never mutates stored content",
    curly !== normalizeForComparison(curly));
}

/* ── Migration contracts ──────────────────────────────────────────────── */
{
  const sql = read("supabase/migrations/20260813170000_collector_dossier_claims.sql");
  ok("claims bind to an exact Vault reference",
    /vault_reference_id uuid not null references public\.vault_references/.test(sql));
  ok("admission and its reasons can never disagree",
    /cdc_admitted_is_clean[\s\S]*array_length\(refusals, 1\), 0\) = 0 and outcome = 'VERIFIED'/.test(sql) &&
    /cdc_refused_has_reason/.test(sql));
  ok("corrections are versioned replacements, never in-place edits",
    /supersedes_id/.test(sql) && /lifecycle in \('current', 'retired'\)/.test(sql));
  ok("one current row per claim key per reference",
    /cdc_current_key_per_reference[\s\S]*where lifecycle = 'current'/.test(sql));
  ok("the hash covers admitted current claims only",
    /admission = 'ADMITTED'/.test(sql) && /lifecycle = 'current'/.test(sql));
  ok("module traceability is representable and never rendered",
    /module_hint/.test(sql) && /never rendered/.test(sql));
  const down = read("supabase/rollbacks/20260813170000_collector_dossier_claims.down.sql");
  ok("rollback refuses while admitted claims exist",
    /retire them before rolling back/.test(down));
}

console.log(`\n  dossier-claims-corpus: ${n} assertions PASS`);
