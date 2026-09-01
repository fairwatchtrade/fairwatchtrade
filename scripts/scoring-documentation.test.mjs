/* The score must never stop speaking to a seller.

   Run: node --experimental-strip-types scripts/scoring-documentation.test.mjs

   THE DEFECT THIS PINS, AND WHY IT IS NOT COSMETIC.

   Completeness exists to reward effort in real time — the module's own header
   calls it password-strength-meter psychology. It is how FairWatchTrade tells a
   seller that another photograph, or the box, or writing in their own voice, is
   worth doing. If it stops producing a number, the mechanism that encourages
   better listings has gone silent.

   It had. Two vocabularies described one fact and drifted:

     lib/scoring.ts              Full Set · Papers Only · Box Only  · Watch Only
     lib/listingDocumentation.ts Full Set · Papers Only · Watch Only · No Box or Papers

   Scoring knew "Box Only", which the product offers nowhere. The product
   offered "No Box or Papers", which scoring had never heard of. A listing
   carrying it indexed DOC_POINTS to `undefined`, `undefined` poisoned the sum,
   and the seller was shown NaN — as were all fourteen listings whose details
   carried no documentation key at all.

   TypeScript could not catch it: `documentation` is TYPED as the scoring
   vocabulary, so the compiler believed the lookup always hit. The type was a
   lie about jsonb, which holds whatever any historical writer put there.

   Guards:
     · every value the PRODUCT can emit scores to a finite number;
     · the two vocabularies can never drift apart again;
     · no malformed, retired, or absent value can produce NaN, anywhere in the
       result — not in documentation, not in completeness, not in combined;
     · and every existing weight is pinned, because this was a repair and a
       repair changes nothing it was not sent to change. */
import assert from "node:assert/strict";
import {
  COMPLETENESS,
  COMPLETENESS_MAX,
  documentationPoints,
  scoreCompleteness,
  scoreListing,
} from "../lib/scoring.ts";
import { DOCUMENTATION_STATES } from "../lib/listingDocumentation.ts";

let pass = 0;
const ok = (label, cond) => {
  assert.ok(cond, label);
  pass++;
};

/** A listing with nothing else going on, so documentation is the only variable. */
const stateWith = (documentation) => ({
  significanceScore: 40,
  photoCategories: ["Dial", "Caseback", "Clasp / Pin Buckle"],
  hasBracelet: false,
  hasWristShot: false,
  documentation,
  descriptionWordCount: 80,
  descriptionPassedAI: true,
});

/* ── 1 · Weights are unchanged. This was a repair. ─────────────────────── */
{
  ok("Full Set still earns the documentation maximum",
    documentationPoints("Full Set") === COMPLETENESS.fullDocumentation);
  ok("Full Set is still 5", documentationPoints("Full Set") === 5);
  ok("Papers Only is still 3", documentationPoints("Papers Only") === 3);
  ok("Box Only is still 2", documentationPoints("Box Only") === 2);
  ok("Watch Only is still 0", documentationPoints("Watch Only") === 0);
  ok("the completeness ceiling is still 22", COMPLETENESS_MAX === 22);
}

/* ── 2 · The value that was missing ────────────────────────────────────── */
{
  ok('"No Box or Papers" now scores', Number.isFinite(documentationPoints("No Box or Papers")));
  ok("and earns nothing, the same as Watch Only — no box, no papers, same fact",
    documentationPoints("No Box or Papers") === documentationPoints("Watch Only"));
}

/* ── 3 · Every value the PRODUCT can emit is scorable ──────────────────── */
{
  ok("the product vocabulary was actually found", DOCUMENTATION_STATES.size >= 4);
  for (const value of DOCUMENTATION_STATES) {
    ok(`"${value}" scores a finite number`, Number.isFinite(documentationPoints(value)));
    const r = scoreListing(stateWith(value));
    ok(`"${value}" yields a finite completeness`, Number.isFinite(r.completeness));
    ok(`"${value}" yields a finite combined score`, Number.isFinite(r.combined));
    ok(`"${value}" yields a tier`, typeof r.tier === "string" && r.tier.length > 0);
  }
}

/* ── 4 · DRIFT GUARD — the two vocabularies cannot part again ──────────
   The original defect was not an unmapped value; it was two lists of the same
   fact maintained separately. A value the product can emit but scoring cannot
   score must fail here, naming itself. */
{
  const unscorable = [...DOCUMENTATION_STATES].filter(
    (v) => !Number.isFinite(documentationPoints(v)) || documentationPoints(v) === undefined
  );
  ok(
    `every product documentation state has a score${unscorable.length ? " — unscorable: " + unscorable.join(", ") : ""}`,
    unscorable.length === 0
  );
}

/* ── 5 · Nothing malformed can poison the score ────────────────────────
   listings.details is jsonb. It holds whatever any writer ever put there: a
   retired vocabulary, a typo, a trailing space, a null, a missing key. Every
   one of these earns nothing, and NONE of them returns anything but a finite
   number. */
{
  const junk = [
    null,
    undefined,
    "",
    "   ",
    "no box or papers", // wrong case — not the stored vocabulary
    "No Box or Papers ", // trailing space
    "Box and Papers", // never existed
    "Full  Set", // double space
    42,
    NaN,
    true,
    {},
    [],
    ["Full Set"],
    { value: "Full Set" },
  ];

  for (const value of junk) {
    const label = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
    ok(`${label} earns nothing`, documentationPoints(value) === 0);
    ok(`${label} is a finite number`, Number.isFinite(documentationPoints(value)));

    const r = scoreListing(stateWith(value));
    ok(`${label} leaves completeness finite`, Number.isFinite(r.completeness));
    ok(`${label} leaves combined finite`, Number.isFinite(r.combined));
    ok(
      `${label} leaves every completeness item finite`,
      scoreCompleteness(stateWith(value)).items.every((i) => Number.isFinite(i.earned))
    );
  }
}

/* ── 6 · The absent key — fourteen production listings ─────────────────── */
{
  const noKey = stateWith(undefined);
  delete noKey.documentation;
  const r = scoreListing(noKey);
  ok("a listing whose details carry no documentation key still scores",
    Number.isFinite(r.combined) && Number.isFinite(r.completeness));
  ok("and it simply earns nothing for documentation",
    scoreCompleteness(noKey).items.find((i) => i.key === "documentation")?.earned === 0);
}

/* ── 7 · The repair did not reach past documentation ───────────────────── */
{
  const full = scoreListing(stateWith("Full Set"));
  const none = scoreListing(stateWith("Watch Only"));
  ok("documentation still moves the score, so the ladder still works",
    full.completeness - none.completeness === COMPLETENESS.fullDocumentation);
  ok("significance passes through untouched", full.significance === 40);
  ok("combined is still significance plus completeness",
    full.combined === full.significance + full.completeness);
}

console.log(`scoring-documentation: ${pass} assertions PASS`);
