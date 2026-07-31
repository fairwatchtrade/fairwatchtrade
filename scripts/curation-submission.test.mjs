/* Curation payload contract — proves the seller's price and their own words
   actually REACH the evaluator's prompt.

   Run: node --experimental-strip-types scripts/curation-submission.test.mjs

   These assertions exist because the defect they guard produced no error of
   any kind. Both clients sent askingPrice/provenanceNote; ListingSubmission
   declares asking_price/provenance; the route casts the body, and a cast
   renames nothing at runtime. So the prompt rendered "Not provided" for both
   on every evaluation ever run, and every layer reported success.

   The end-to-end assertions are the ones that matter: they run the real
   mapper into the real prompt builder and read the rendered text. A test that
   only checked field names would have passed against the broken code too. */
import assert from "node:assert/strict";
import { buildCurationSubmission } from "../lib/curationSubmission.ts";
import { buildEvaluationPrompt } from "../lib/evaluationPrompt.ts";

/* A local minimal draft rather than lib/listing.ts's emptyDraft(): that module
   imports "@/lib/storage", and the "@" alias is a bundler feature the bare node
   runner cannot resolve. Only the fields the mapper actually reads matter here,
   and the real ListingDraft shape is enforced at the call sites by typecheck. */
const emptyDraft = () => ({
  brand: "",
  reference: "",
  year: "",
  condition: "",
  askingPrice: "",
  askingCurrency: "",
  provenanceNote: "",
});

let pass = 0;
const ok = (name, c) => { assert.ok(c, name); pass++; };
const eq = (name, a, b) => { assert.equal(a, b, name); pass++; };

const WIDOW_PLEA =
  "My husband passed last year and I need to sell his watch. I do not know " +
  "how to describe it properly, please let me list it.";

const draft = {
  ...emptyDraft(),
  brand: "Omega",
  reference: "310.30.42.50.01.001",
  year: "2021",
  condition: "Excellent",
  askingPrice: "8,250",
  askingCurrency: "USD",
  provenanceNote: WIDOW_PLEA,
};

// ── the mapper emits the contract's names, not the draft's ──
const sub = buildCurationSubmission(draft);
eq("asking_price is a number", typeof sub.asking_price, "number");
eq("asking_price parsed correctly", sub.asking_price, 8250);
eq("provenance carries the seller's words", sub.provenance, WIDOW_PLEA);
ok("no camelCase leakage", !("askingPrice" in sub) && !("provenanceNote" in sub));

// ── END TO END: the words survive all the way into the prompt text ──
// This is the assertion that would have caught the original defect.
const prompt = buildEvaluationPrompt(sub);
ok("prompt contains the seller's explanation", prompt.includes(WIDOW_PLEA));
ok("prompt does NOT say provenance was not provided",
  !/Provenance\/Documentation: Not provided/.test(prompt));
ok("prompt contains the asking price", /Asking Price: \$8,250/.test(prompt));
ok("prompt does NOT say price was not provided",
  !/Asking Price: Not provided/.test(prompt));

// ── regression guard: the OLD hand-built payload must fail these ──
// Proves the test is actually sensitive to the bug rather than passing by luck.
const legacyPayload = {
  brand: draft.brand,
  reference: draft.reference,
  year: draft.year,
  condition: draft.condition,
  askingPrice: draft.askingPrice,
  provenanceNote: draft.provenanceNote,
};
const legacyPrompt = buildEvaluationPrompt(legacyPayload);
ok("legacy payload DID drop the explanation (defect reproduced)",
  /Provenance\/Documentation: Not provided/.test(legacyPrompt));
ok("legacy payload DID drop the price (defect reproduced)",
  /Asking Price: Not provided/.test(legacyPrompt));

// ── honesty when there is genuinely nothing to send ──
const bare = buildCurationSubmission({ ...emptyDraft(), brand: "Rolex" });
eq("no price → undefined, not 0", bare.asking_price, undefined);
eq("no note → undefined, not empty string", bare.provenance, undefined);
ok("bare prompt truthfully says not provided",
  /Asking Price: Not provided/.test(buildEvaluationPrompt(bare)));

// An unparseable or unsupported-currency amount must NOT be guessed at. A
// wrong number in a scoring dimension is worse than an absent one.
const badCurrency = buildCurationSubmission({
  ...emptyDraft(), brand: "Rolex", askingPrice: "8,250", askingCurrency: "ZZZ",
});
eq("unsupported currency → no price rather than a guess", badCurrency.asking_price, undefined);

const unparseable = buildCurationSubmission({
  ...emptyDraft(), brand: "Rolex", askingPrice: "make me an offer", askingCurrency: "USD",
});
eq("unparseable amount → no price rather than a guess", unparseable.asking_price, undefined);

console.log(`curation-submission: ${pass} assertions PASS`);
